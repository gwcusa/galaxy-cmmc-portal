import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/info-requests — client: list their pending/responded requests
export async function GET() {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  // Find the client record for this user
  const { data: client } = await svc
    .from("clients")
    .select("id, engagement_type")
    .eq("user_id", user.id)
    .single();

  if (!client) return NextResponse.json({ requests: [] });

  // Find their active assessment(s)
  const { data: assessments } = await svc
    .from("assessments")
    .select("id")
    .eq("client_id", client.id)
    .not("status", "eq", "archived");

  if (!assessments?.length) return NextResponse.json({ requests: [] });

  const assessmentIds = assessments.map((a) => a.id);

  const { data, error } = await svc
    .from("information_requests")
    .select("id, assessment_id, subject, body, status, requested_at, client_response, responded_at")
    .in("assessment_id", assessmentIds)
    .neq("status", "closed")
    .order("requested_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}
