import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/assessment?clientId=xxx
export async function GET(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", session.user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Look for any non-archived assessment for this client
  let { data: assessment } = await supabase
    .from("assessments")
    .select("id, status")
    .eq("client_id", clientId)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  // Create a new assessment only if none exists or the latest is finalized
  if (!assessment || assessment.status === "finalized") {
    const { data: newAssessment, error } = await supabase
      .from("assessments")
      .insert({ client_id: clientId, status: "in_progress" })
      .select("id, status")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assessment = newAssessment;
  }

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts")
    .eq("assessment_id", assessment!.id);

  return NextResponse.json({
    assessmentId: assessment!.id,
    assessmentStatus: assessment!.status,
    responses: responses || [],
  });
}

// POST /api/assessment
export async function POST(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assessmentId, controlId, response, notes, no_artifacts } = body;

  if (!assessmentId || !controlId || !response) {
    return NextResponse.json({ error: "assessmentId, controlId, response required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("assessment_responses")
    .upsert(
      {
        assessment_id: assessmentId,
        control_id: controlId,
        response,
        notes: notes ?? null,
        no_artifacts: no_artifacts ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
