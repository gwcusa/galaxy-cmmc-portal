import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

// POST /api/admin/assessment/[id]/assign { assessorId } — assign an assessor (null to unassign)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessorId } = await req.json();

  if (assessorId) {
    const { data: assessorRole } = await svc
      .from("user_roles")
      .select("role")
      .eq("user_id", assessorId)
      .single();
    if (assessorRole?.role !== "admin") {
      return NextResponse.json({ error: "assessorId is not an assessor account" }, { status: 400 });
    }
  }

  const { error } = await svc
    .from("assessments")
    .update({ assigned_to: assessorId ?? null })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "assessment.assigned",
    entityType: "assessment",
    entityId: params.id,
    metadata: { assessorId: assessorId ?? null },
  });

  return NextResponse.json({ success: true });
}
