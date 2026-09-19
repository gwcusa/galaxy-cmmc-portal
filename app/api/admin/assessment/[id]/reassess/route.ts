import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReassessmentStartedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST /api/admin/assessment/[id]/reassess
// Starts a new assessment cycle for the client, carrying forward their
// previous control responses so only changed controls need to be re-touched.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const previousAssessmentId = params.id;

  const { data: previousAssessment } = await svc
    .from("assessments")
    .select("id, client_id, status")
    .eq("id", previousAssessmentId)
    .single();

  if (!previousAssessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }
  if (previousAssessment.status !== "finalized") {
    return NextResponse.json(
      { error: "Only a finalized assessment can be reassessed" },
      { status: 400 }
    );
  }

  // Guard against double-starting: this must still be the client's current (latest, non-archived) cycle.
  const { data: latest } = await svc
    .from("assessments")
    .select("id")
    .eq("client_id", previousAssessment.client_id)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (latest?.id !== previousAssessmentId) {
    return NextResponse.json(
      { error: "A newer assessment cycle already exists for this client" },
      { status: 400 }
    );
  }

  const { data: newAssessment, error: insertError } = await svc
    .from("assessments")
    .insert({
      client_id: previousAssessment.client_id,
      status: "in_progress",
      previous_assessment_id: previousAssessmentId,
    })
    .select("id")
    .single();

  if (insertError || !newAssessment) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create assessment" }, { status: 500 });
  }

  // Carry forward the client's previous control responses.
  const { data: previousResponses, error: responsesError } = await svc
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", previousAssessmentId);

  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 });
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
      return NextResponse.json({ error: copyError.message }, { status: 500 });
    }
  }

  logAudit({
    actorId: user.id,
    actorRole: role?.role ?? "assessor",
    action: "assessment.reassessment_started",
    entityType: "assessment",
    entityId: newAssessment.id,
    metadata: { previousAssessmentId, clientId: previousAssessment.client_id, controlsCarried: previousResponses?.length ?? 0 },
  });

  // Notify the client — fire and forget
  const { data: clientRecord } = await svc
    .from("clients")
    .select("contact_name, company_name, user_id")
    .eq("id", previousAssessment.client_id)
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

  return NextResponse.json({ success: true, assessmentId: newAssessment.id });
}
