import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { startReassessmentCycle } from "@/lib/reassessment";

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

  const { data: previousAssessment } = await svc
    .from("assessments")
    .select("id, client_id")
    .eq("id", params.id)
    .single();

  if (!previousAssessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const result = await startReassessmentCycle({
    svc,
    clientId: previousAssessment.client_id,
    previousAssessmentId: params.id,
    actorUserId: user.id,
    actorRole: (role?.role ?? "assessor") as "admin" | "assessor",
    notifyClient: true,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, assessmentId: result.assessmentId });
}
