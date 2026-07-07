import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/admin/assessors — list assessor (admin) accounts for assignment
export async function GET() {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: admins } = await svc.from("user_roles").select("user_id").eq("role", "admin");

  const assessors = await Promise.all(
    (admins ?? []).map(async ({ user_id }) => {
      const { data } = await svc.auth.admin.getUserById(user_id);
      return {
        id: user_id,
        email: data?.user?.email ?? "(unknown)",
        name: (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email ?? "(unknown)",
      };
    })
  );

  return NextResponse.json({ assessors });
}
