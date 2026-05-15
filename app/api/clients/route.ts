import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  // 1. Verify session
  const serverSupabase = createServerSupabaseClient();
  const { data: { session } } = await serverSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Check admin role
  if (session.user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse body
  const body = await req.json();
  const { email, password, companyName, contactName, phone, cmmcTargetLevel, engagementStage, notes } = body;

  // 4. Validate
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!companyName || typeof companyName !== "string" || !companyName.trim()) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }
  if (!contactName || typeof contactName !== "string" || !contactName.trim()) {
    return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
  }
  if (cmmcTargetLevel !== 1 && cmmcTargetLevel !== 2) {
    return NextResponse.json({ error: "CMMC target level must be 1 or 2" }, { status: 400 });
  }

  // 5. Create Supabase auth user via admin API
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: contactName, role: "client" },
  });

  if (authError || !authData?.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create auth user" }, { status: 400 });
  }

  const userId = authData.user.id;

  // 6. Insert client record using service role
  const serviceSupabase = createServiceSupabaseClient();

  const { data: clientData, error: clientError } = await serviceSupabase
    .from("clients")
    .insert({
      user_id: userId,
      company_name: companyName,
      contact_name: contactName,
      phone: phone || null,
      cmmc_target_level: cmmcTargetLevel,
      engagement_stage: engagementStage,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (clientError) {
    // Cleanup: delete the auth user we just created
    await adminClient.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  // 7. Insert user_roles record
  const { error: roleError } = await serviceSupabase
    .from("user_roles")
    .insert({ user_id: userId, role: "client" });

  if (roleError) {
    // Non-fatal: log but don't fail the request
    console.error("Failed to insert user_roles:", roleError.message);
  }

  // 8. Return success
  return NextResponse.json({ success: true, clientId: clientData.id, userId });
}
