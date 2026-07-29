import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

type AdminResult = { user: { id: string }; svc: ReturnType<typeof createServiceSupabaseClient>; role: "admin" };
type AdminOrAssessorResult = { user: { id: string }; svc: ReturnType<typeof createServiceSupabaseClient>; role: "admin" | "assessor" };
type ErrorResult = { error: string; status: 401 | 403 };

export async function requireAdmin(): Promise<AdminResult | ErrorResult> {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (roleRow?.role !== "admin") return { error: "Forbidden", status: 403 };

  return { user, svc, role: "admin" };
}

export async function requireAdminOrAssessor(): Promise<AdminOrAssessorResult | ErrorResult> {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(roleRow?.role ?? "")) return { error: "Forbidden", status: 403 };

  return { user, svc, role: roleRow!.role as "admin" | "assessor" };
}
