import type { createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReassessmentStartedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

type Svc = ReturnType<typeof createServiceSupabaseClient>;

export type StartReassessmentCycleInput = {
  svc: Svc;
  clientId: string;
  previousAssessmentId: string;
  actorUserId: string;
  actorRole: "admin" | "assessor" | "client";
  /** Send sendReassessmentStartedEmail to the client (fire and forget). */
  notifyClient: boolean;
};

export type StartReassessmentCycleResult =
  | { ok: true; assessmentId: string; controlsCarried: number }
  | { ok: false; status: 400 | 404 | 500; error: string };

/**
 * Opens a new in_progress assessment cycle for a client whose previous cycle is
 * finalized, carrying the previous control responses forward. Shared by the
 * admin/assessor reassess route, the admin license-assign route and the client
 * start-cycle route.
 */
export async function startReassessmentCycle(input: StartReassessmentCycleInput): Promise<StartReassessmentCycleResult> {
  const { svc, clientId, previousAssessmentId, actorUserId, actorRole, notifyClient } = input;

  const { data: previousAssessment } = await svc
    .from("assessments")
    .select("id, client_id, status")
    .eq("id", previousAssessmentId)
    .single();

  if (!previousAssessment || previousAssessment.client_id !== clientId) {
    return { ok: false, status: 404, error: "Assessment not found" };
  }
  if (previousAssessment.status !== "finalized") {
    return { ok: false, status: 400, error: "Only a finalized assessment can be reassessed" };
  }

  // Guard against double-starting: this must still be the client's current (latest, non-archived) cycle.
  const { data: latest } = await svc
    .from("assessments")
    .select("id")
    .eq("client_id", clientId)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (latest?.id !== previousAssessmentId) {
    return { ok: false, status: 400, error: "A newer assessment cycle already exists for this client" };
  }

  const { data: newAssessment, error: insertError } = await svc
    .from("assessments")
    .insert({
      client_id: clientId,
      status: "in_progress",
      previous_assessment_id: previousAssessmentId,
    })
    .select("id")
    .single();

  if (insertError || !newAssessment) {
    return { ok: false, status: 500, error: insertError?.message ?? "Failed to create assessment" };
  }

  // Carry forward the client's previous control responses.
  const { data: previousResponses, error: responsesError } = await svc
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", previousAssessmentId);

  if (responsesError) {
    return { ok: false, status: 500, error: responsesError.message };
  }

  if (previousResponses && previousResponses.length > 0) {
    const carriedRows = previousResponses.map((r) => ({
      assessment_id: newAssessment.id,
      control_id: r.control_id,
      response: r.response,
      notes: r.notes,
      no_artifacts: r.no_artifacts,
      no_policy_document: r.no_policy_document,
      no_implementation_artifact: r.no_implementation_artifact,
    }));
    const { error: copyError } = await svc.from("assessment_responses").insert(carriedRows);
    if (copyError) {
      return { ok: false, status: 500, error: copyError.message };
    }
  }

  const controlsCarried = previousResponses?.length ?? 0;

  logAudit({
    actorId: actorUserId,
    actorRole,
    action: "assessment.reassessment_started",
    entityType: "assessment",
    entityId: newAssessment.id,
    metadata: { previousAssessmentId, clientId, controlsCarried },
  });

  if (notifyClient) {
    const { data: clientRecord } = await svc
      .from("clients")
      .select("contact_name, company_name, user_id")
      .eq("id", clientId)
      .single();

    if (clientRecord) {
      const { data: authUser } = await svc.auth.admin.getUserById(clientRecord.user_id);
      if (authUser?.user?.email) {
        sendReassessmentStartedEmail({
          clientEmail: authUser.user.email,
          clientName: clientRecord.contact_name,
          companyName: clientRecord.company_name,
        }).catch(() => {});
      }
    }
  }

  return { ok: true, assessmentId: newAssessment.id, controlsCarried };
}
