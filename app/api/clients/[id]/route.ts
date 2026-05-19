import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// PATCH /api/clients/[id] — update editable client fields (admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", session.user.id).single();
  if (roleRow?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const allowed = ["engagement_type", "engagement_stage", "notes"] as const;
  const updates: Record<string, string> = {};

  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.engagement_type && !["assessment", "remediation"].includes(body.engagement_type)) {
    return NextResponse.json({ error: "Invalid engagement_type" }, { status: 400 });
  }
  if (body.engagement_stage && !["lead", "active", "completed"].includes(body.engagement_stage)) {
    return NextResponse.json({ error: "Invalid engagement_stage" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await svc.from("clients").update(updates).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
