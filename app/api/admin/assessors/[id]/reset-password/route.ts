import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user: targetUser }, error: lookupError } = await adminClient.auth.admin.getUserById(params.id);
  if (lookupError || !targetUser?.email) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(targetUser.email, {
    redirectTo: `${appUrl}/update-password`,
  });

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
