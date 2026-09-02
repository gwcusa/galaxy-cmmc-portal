import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "admin" | "assessor" | "client";

/** Where a user lands after signing in / setting a password. */
export function landingPathForRole(role: string | null | undefined): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "assessor") return "/assessor/dashboard";
  return "/portal/dashboard";
}

/**
 * Resolve a user's role from the user_roles table (authoritative — the RLS
 * policy user_roles_read_own lets a user read their own row with the anon key),
 * falling back to the auth user_metadata copy if the row is missing.
 */
export async function resolveUserRole(
  supabase: SupabaseClient,
  userId: string,
  metadataRole?: unknown
): Promise<AppRole> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const role = (data?.role as string | undefined) ?? (typeof metadataRole === "string" ? metadataRole : undefined);
  return role === "admin" || role === "assessor" ? role : "client";
}
