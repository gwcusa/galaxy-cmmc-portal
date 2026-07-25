import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { runAssessmentReview, executeReviewRun } from "@/lib/run-assessment-review";
import { sendAssessmentSubmittedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getControlsForLevel } from "@/lib/controls";

export const maxDuration = 300;

// POST /api/assessment/submit
// Called when a client completes their assessment.
// Sets status to 'submitted' and triggers AI analysis for all yes/partial controls.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId } = await req.json();
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const serviceSupabase = createServiceSupabaseClient();

  // Verify the assessment belongs to this user
  const { data: assessment } = await serviceSupabase
    .from("assessments")
    .select("id, status, client_id, clients(user_id, cmmc_target_level)")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const client = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  if (!client || (client as { user_id: string; cmmc_target_level?: number }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const targetLevel = ((client as { cmmc_target_level?: number }).cmmc_target_level ?? 2) as 1 | 2;
  const applicableControlIds = new Set(getControlsForLevel(targetLevel).map((c) => c.id));

  // Allow submission from in_progress (→ submitted) or remediation_required (→ resubmitted)
  if (assessment.status !== "in_progress" && assessment.status !== "remediation_required") {
    return NextResponse.json({ error: "Assessment cannot be submitted in its current state" }, { status: 400 });
  }

  const newStatus = assessment.status === "remediation_required" ? "resubmitted" : "submitted";

  // Get all controls the client answered yes or partial, filtered to their CMMC target level.
  // Controls outside the client's level (e.g. level-2 controls for a level-1 client) are
  // never shown in the assessment UI, so we must not validate evidence for them.
  const { data: allResponses } = await serviceSupabase
    .from("assessment_responses")
    .select("control_id, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", assessmentId)
    .in("response", ["yes", "partial"]);
  const responses = (allResponses ?? []).filter((r) => applicableControlIds.has(r.control_id));

  // Validate BEFORE changing status: every yes/partial control must have
  // (policy artifact OR no_policy_document) AND (implementation artifact OR no_implementation_artifact).
  // Legacy: no_artifacts=true satisfies both types; artifact_type=null satisfies both types.
  const controlsNeedingCheck = (responses ?? [])
    .filter((r) => {
      const policyOk = r.no_artifacts || r.no_policy_document;
      const implOk = r.no_artifacts || r.no_implementation_artifact;
      return !(policyOk && implOk);
    })
    .map((r) => r.control_id);

  if (controlsNeedingCheck.length > 0) {
    const { data: artifacts } = await serviceSupabase
      .from("artifacts")
      .select("control_id, artifact_type")
      .eq("assessment_id", assessmentId)
      .in("control_id", controlsNeedingCheck);

    const missing: string[] = [];
    for (const r of (responses ?? []).filter((r) => controlsNeedingCheck.includes(r.control_id))) {
      const controlArtifacts = (artifacts ?? []).filter((a) => a.control_id === r.control_id);
      const policyOk = r.no_artifacts || r.no_policy_document ||
        controlArtifacts.some((a) => a.artifact_type === "policy" || a.artifact_type === null);
      const implOk = r.no_artifacts || r.no_implementation_artifact ||
        controlArtifacts.some((a) => a.artifact_type === "implementation" || a.artifact_type === null);
      if (!policyOk || !implOk) missing.push(r.control_id);
    }

    if (missing.length > 0) {
      return NextResponse.json({
        error: "Evidence required",
        missingArtifacts: missing,
        message: `${missing.length} control(s) require both a policy document and implementation evidence. Please upload both types or mark each as unavailable for: ${missing.join(", ")}`,
      }, { status: 400 });
    }
  }

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

  logAudit({
    actorId: user.id,
    actorRole: "client",
    action: newStatus === "resubmitted" ? "assessment.resubmitted" : "assessment.submitted",
    entityType: "assessment",
    entityId: assessmentId,
  });

  // Start a tracked AI review run (per-control reviews + synthesis) — waitUntil
  // keeps it alive after the response returns.
  let reviewsQueued = 0;
  if ((responses ?? []).length > 0) {
    const { runId, total } = await runAssessmentReview(assessmentId, user.id);
    reviewsQueued = total;
    waitUntil(executeReviewRun(runId, assessmentId));
  }

  return NextResponse.json({ success: true, newStatus, reviewsQueued });
}
