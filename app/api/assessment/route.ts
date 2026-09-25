import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { getEntitlement, requireClientLicense } from "@/lib/licensing";

// GET /api/assessment?clientId=xxx
export async function GET(req: NextRequest) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  const supabase = createServiceSupabaseClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Look for any non-archived assessment for this client
  let { data: assessment } = await supabase
    .from("assessments")
    .select("id, status, previous_assessment_id")
    .eq("client_id", clientId)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  // Create a client's very first assessment automatically. It is an empty cycle
  // the client cannot edit until a license is assigned. Once an assessment is
  // finalized, the next cycle starts when an admin/assessor kicks off a
  // reassessment, when a license assignment opens one, or when an Unlimited
  // client starts one — all through lib/reassessment.ts.
  if (!assessment) {
    const { data: newAssessment, error } = await supabase
      .from("assessments")
      .insert({ client_id: clientId, status: "in_progress" })
      .select("id, status, previous_assessment_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assessment = newAssessment;
  }

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", assessment!.id);

  // Previous cycle's answers, shown as a muted reference on each control.
  let previousResponses: { control_id: string; response: string }[] = [];
  const previousAssessmentId = (assessment as { previous_assessment_id?: string | null }).previous_assessment_id ?? null;
  if (previousAssessmentId) {
    const { data: prev } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", previousAssessmentId);
    previousResponses = prev ?? [];
  }

  const entitlement = await getEntitlement(supabase, clientId);

  return NextResponse.json({
    assessmentId: assessment!.id,
    assessmentStatus: assessment!.status,
    responses: responses || [],
    previousResponses,
    entitlement,
  });
}

// POST /api/assessment
// Saves one control response. Only the owning client may write, only while the
// cycle is editable, and only under an active license.
export async function POST(req: NextRequest) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  const supabase = createServiceSupabaseClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assessmentId, controlId, response, notes, no_artifacts, no_policy_document, no_implementation_artifact } = body;

  if (!assessmentId || !controlId || !response) {
    return NextResponse.json({ error: "assessmentId, controlId, response required" }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, status, client_id, clients(user_id)")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const owner = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  if (!owner || (owner as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (assessment.status !== "in_progress" && assessment.status !== "remediation_required") {
    return NextResponse.json({ error: "Assessment is not editable in its current state" }, { status: 400 });
  }

  const denied = await requireClientLicense(supabase, assessment.client_id as string);
  if (denied) return denied;

  const { error } = await supabase
    .from("assessment_responses")
    .upsert(
      {
        assessment_id: assessmentId,
        control_id: controlId,
        response,
        notes: notes ?? null,
        no_artifacts: no_artifacts ?? false,
        no_policy_document: no_policy_document ?? false,
        no_implementation_artifact: no_implementation_artifact ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
