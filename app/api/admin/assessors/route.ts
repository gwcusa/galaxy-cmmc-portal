import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/admin/assessors — list admin + assessor accounts for assignment
export async function GET() {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Role check — reading own row, so svc (cookie-based) works here
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Use adminClient to bypass RLS for reading all admin/assessor rows
  const { data: rows } = await adminClient
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "assessor"]);

  const assessors = await Promise.all(
    (rows ?? []).map(async ({ user_id, role: r }) => {
      const { data } = await adminClient.auth.admin.getUserById(user_id);
      return {
        id: user_id,
        role: r,
        email: data?.user?.email ?? "(unknown)",
        name: (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email ?? "(unknown)",
      };
    })
  );

  return NextResponse.json({ assessors });
}

// POST /api/admin/assessors — invite a new assessor account (admin-only)
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { email, fullName } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const tempPassword = crypto.randomUUID() + crypto.randomUUID();

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName.trim(), role: "assessor" },
  });

  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create user" }, { status: 400 });
  }

  const userId = authData.user.id;

  const { error: roleError } = await adminClient
    .from("user_roles")
    .insert({ user_id: userId, role: "assessor" });

  if (roleError) {
    await adminClient.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/update-password`,
  });

  if (resetError) {
    console.error("Failed to send assessor invite email:", resetError.message);
  }

  return NextResponse.json({ success: true, userId, inviteEmailSent: !resetError });
}
