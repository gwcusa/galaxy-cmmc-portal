import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (roleRow?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { disabled } = await req.json();
  if (typeof disabled !== "boolean") {
    return NextResponse.json({ error: "disabled (boolean) required" }, { status: 400 });
  }

  const { data: client } = await svc.from("clients").select("user_id").eq("id", params.id).single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // ban_duration "876600h" = ~100 years (effectively permanent); "none" lifts the ban
  const { error } = await svc.auth.admin.updateUserById(client.user_id, {
    ban_duration: disabled ? "876600h" : "none",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
