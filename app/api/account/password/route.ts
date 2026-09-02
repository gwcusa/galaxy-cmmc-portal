import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

const MIN_LENGTH = 8;
// Supabase hashes with bcrypt, which silently truncates past 72 bytes.
const MAX_LENGTH = 72;

// POST /api/account/password — any signed-in user changes their own password.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 });
  }
  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json({ error: `New password must be at least ${MIN_LENGTH} characters` }, { status: 400 });
  }
  if (Buffer.byteLength(newPassword, "utf8") > MAX_LENGTH) {
    return NextResponse.json({ error: `New password must be at most ${MAX_LENGTH} characters` }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "New password must be different from the current one" }, { status: 400 });
  }

  // Verify the current password on a throwaway client so the caller's session
  // is untouched. Nothing is persisted, and we never call signOut() here —
  // supabase-js defaults to a global scope, which would revoke every session
  // this user has, including the one making this request.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  // Update through the caller's OWN session, not auth.admin.updateUserById():
  // the admin API revokes every session including this one, which would dump
  // the user back at the login screen. Going through their session keeps them
  // signed in here and signs out their other devices — which is what we want.
  const { error: updateError } = await authSupabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  await logAudit({
    actorId: user.id,
    actorRole: (roleRow?.role ?? "client") as "admin" | "assessor" | "client",
    action: "account.password_changed",
    entityType: "user",
    entityId: user.id,
  });

  return NextResponse.json({ success: true });
}
