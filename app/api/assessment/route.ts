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

  let { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "in_progress")
    .single();

  if (!assessment) {
    const { data: newAssessment, error } = await supabase
      .from("assessments")
      .insert({ client_id: clientId, status: "in_progress" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assessment = newAssessment;
  }

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("control_id, response, notes")
    .eq("assessment_id", assessment!.id);

  return NextResponse.json({ assessmentId: assessment!.id, responses: responses || [] });
}

// POST /api/assessment
export async function POST(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assessmentId, controlId, response, notes } = body;

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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
