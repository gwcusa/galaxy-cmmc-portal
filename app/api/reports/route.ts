import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { generatePdf } from "@/components/pdf/ReportTemplate";

// Direct service-role client for storage (avoids SSR cookie issues)
function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/reports — generate a new PDF report
export async function POST(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { assessmentId } = body;
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  }

  // Load assessment
  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, client_id, status, total_score, started_at, completed_at")
    .eq("id", assessmentId)
    .single();

  if (assessmentError || !assessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  // Load client — verify the calling user owns this client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, user_id, company_name, contact_name, cmmc_target_level")
    .eq("id", assessment.client_id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Only the owning user (or service admin) may generate reports
  if (client.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load responses
  const { data: responseRows, error: responsesError } = await supabase
    .from("assessment_responses")
    .select("control_id, response")
    .eq("assessment_id", assessmentId);

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 });
  }

  // Build ResponseMap
  const responses: ResponseMap = {};
  for (const row of responseRows ?? []) {
    responses[row.control_id] = row.response as "yes" | "partial" | "no" | "na";
  }

  // Calculate score
  const score = calculateScore(responses);

  // Generate PDF buffer
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generatePdf({
      companyName: client.company_name ?? "Unknown Company",
      contactName: client.contact_name ?? "Unknown Contact",
      cmmcLevel: client.cmmc_target_level ?? 2,
      generatedAt: new Date().toISOString(),
      score,
      responses,
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }

  // Upload to Supabase Storage
  const storageClient = getStorageClient();
  const timestamp = Date.now();
  const storagePath = `${client.id}/${assessmentId}/${timestamp}.pdf`;

  // Ensure bucket exists (idempotent — silently fails if it already exists)
  await storageClient.storage.createBucket("reports", { public: false });

  const { error: uploadError } = await storageClient.storage
    .from("reports")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload report" }, { status: 500 });
  }

  // Upsert reports record
  const { data: reportRecord, error: reportError } = await supabase
    .from("reports")
    .upsert(
      {
        assessment_id: assessmentId,
        storage_path: storagePath,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id" }
    )
    .select("id")
    .single();

  if (reportError || !reportRecord) {
    console.error("Report record error:", reportError);
    return NextResponse.json({ error: "Failed to save report record" }, { status: 500 });
  }

  // Create signed URL (1 hour)
  const { data: signedUrlData, error: signedUrlError } = await storageClient.storage
    .from("reports")
    .createSignedUrl(storagePath, 3600);

  if (signedUrlError || !signedUrlData) {
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
  }

  return NextResponse.json({
    reportId: reportRecord.id,
    signedUrl: signedUrlData.signedUrl,
    storagePath,
  });
}

// GET /api/reports?assessmentId=xxx — get signed download URL for existing report
export async function GET(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) {
    return NextResponse.json({ error: "assessmentId required" }, { status: 400 });
  }

  // Fetch latest report for this assessment
  const { data: report, error: reportError } = await supabase
    .from("reports")
    .select("id, storage_path, generated_at")
    .eq("assessment_id", assessmentId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: "No report found" }, { status: 404 });
  }

  // Create signed URL
  const storageClient = getStorageClient();
  const { data: signedUrlData, error: signedUrlError } = await storageClient.storage
    .from("reports")
    .createSignedUrl(report.storage_path, 3600);

  if (signedUrlError || !signedUrlData) {
    return NextResponse.json({ error: "Failed to create signed URL" }, { status: 500 });
  }

  // Record download timestamp
  await supabase
    .from("reports")
    .update({ downloaded_at: new Date().toISOString() })
    .eq("id", report.id);

  return NextResponse.json({
    reportId: report.id,
    signedUrl: signedUrlData.signedUrl,
    generatedAt: report.generated_at,
  });
}
