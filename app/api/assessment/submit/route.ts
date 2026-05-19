import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { runAiReview } from "@/lib/run-ai-review";
import { sendAssessmentSubmittedEmail } from "@/lib/email";

// POST /api/assessment/submit
// Called when a client completes their assessment.
// Sets status to 'submitted' and triggers AI analysis for all yes/partial controls.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId } = await req.json();
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const serviceSupabase = createServiceSupabaseClient();

  // Verify the assessment belongs to this user
  const { data: assessment } = await serviceSupabase
    .from("assessments")
    .select("id, status, client_id, clients(user_id)")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  if (!client || (client as { user_id: string }).user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Allow submission from in_progress (→ submitted) or remediation_required (→ resubmitted)
  if (assessment.status !== "in_progress" && assessment.status !== "remediation_required") {
    return NextResponse.json({ error: "Assessment cannot be submitted in its current state" }, { status: 400 });
  }

  const newStatus = assessment.status === "remediation_required" ? "resubmitted" : "submitted";

  await serviceSupabase
    .from("assessments")
    .update({ status: newStatus })
    .eq("id", assessmentId);

  // Fetch client info for email
  const { data: clientRecord } = await serviceSupabase
    .from("clients")
    .select("id, company_name, contact_name")
    .eq("id", assessment.client_id)
    .single();

  // Notify assessor — fire and forget
  if (clientRecord) {
    sendAssessmentSubmittedEmail({
      companyName: clientRecord.company_name,
      contactName: clientRecord.contact_name,
      clientId: clientRecord.id,
      isResubmission: newStatus === "resubmitted",
    }).catch(() => {});
  }

  // Get all controls the client answered yes or partial
  const { data: responses } = await serviceSupabase
    .from("assessment_responses")
    .select("control_id, no_artifacts")
    .eq("assessment_id", assessmentId)
    .in("response", ["yes", "partial"]);

  // Validate: every yes/partial control must have either an artifact or no_artifacts = true
  const controlsNeedingArtifacts = (responses ?? [])
    .filter((r) => !r.no_artifacts)
    .map((r) => r.control_id);

  if (controlsNeedingArtifacts.length > 0) {
    const { data: artifacts } = await serviceSupabase
      .from("artifacts")
      .select("control_id")
      .eq("assessment_id", assessmentId)
      .in("control_id", controlsNeedingArtifacts);

    const coveredSet = new Set((artifacts ?? []).map((a) => a.control_id));
    const missing = controlsNeedingArtifacts.filter((id) => !coveredSet.has(id));

    if (missing.length > 0) {
      return NextResponse.json({
        error: "Evidence required",
        missingArtifacts: missing,
        message: `${missing.length} control(s) require evidence. Please upload artifacts or select "No artifacts available" for: ${missing.join(", ")}`,
      }, { status: 400 });
    }
  }

  // Fire AI review for each control — use waitUntil so Vercel doesn't kill the work
  const controlIds = (responses ?? []).map((r) => r.control_id);
  if (controlIds.length > 0) {
    waitUntil(
      Promise.allSettled(
        controlIds.map((controlId) =>
          runAiReview(assessmentId, controlId).catch((err) => {
            console.error(`AI review failed for control ${controlId}:`, err);
          })
        )
      )
    );
  }

  return NextResponse.json({ success: true, newStatus, reviewsQueued: (responses ?? []).length });
}
