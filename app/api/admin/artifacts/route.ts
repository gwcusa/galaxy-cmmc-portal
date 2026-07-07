import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

// GET /api/admin/artifacts?assessmentId=xxx — list all generated artifacts
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data, error } = await svc
    .from("generated_artifacts")
    .select("id, artifact_type, control_id, version, title, content, status, generated_at, updated_at")
    .eq("assessment_id", assessmentId)
    .order("generated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artifacts: data ?? [] });
}

// PATCH /api/admin/artifacts — update content or finalize
export async function PATCH(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, content, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (content !== undefined) updates.content = content;
  if (["finalized", "draft", "published"].includes(status)) updates.status = status;

  const { error } = await svc
    .from("generated_artifacts")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: updates.status ? `artifact.status_${updates.status}` : "artifact.edited",
    entityType: "artifact",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
