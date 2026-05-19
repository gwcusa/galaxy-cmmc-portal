import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/admin/determinations?assessmentId=xxx
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceSupabase = createServiceSupabaseClient();
  const { data: role } = await serviceSupabase
    .from("user_roles").select("role").eq("user_id", session.user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data, error } = await serviceSupabase
    .from("assessor_determinations")
    .select("control_id, ai_verdict, ai_feedback, assessor_verdict, assessor_notes, reviewed_at, updated_at")
    .eq("assessment_id", assessmentId)
    .order("reviewed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ determinations: data ?? [] });
}

// POST /api/admin/determinations
// Upserts a single assessor determination for a control.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceSupabase = createServiceSupabaseClient();
  const { data: role } = await serviceSupabase
    .from("user_roles").select("role").eq("user_id", session.user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, controlId, assessorVerdict, assessorNotes } = await req.json();

  if (!assessmentId || !controlId || !assessorVerdict) {
    return NextResponse.json({ error: "assessmentId, controlId, assessorVerdict required" }, { status: 400 });
  }
  if (!["met", "partially_met", "not_met", "needs_review"].includes(assessorVerdict)) {
    return NextResponse.json({ error: "Invalid verdict value" }, { status: 400 });
  }

  // Snapshot current AI recommendation for audit trail
  const { data: aiData } = await serviceSupabase
    .from("control_ai_feedback")
    .select("verdict, feedback")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .single();

  const now = new Date().toISOString();

  const { error } = await serviceSupabase
    .from("assessor_determinations")
    .upsert(
      {
        assessment_id: assessmentId,
        control_id: controlId,
        ai_verdict: aiData?.verdict ?? null,
        ai_feedback: aiData?.feedback ?? null,
        assessor_verdict: assessorVerdict,
        assessor_notes: assessorNotes ?? null,
        reviewed_by: session.user.id,
        reviewed_at: now,
        updated_at: now,
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, reviewedAt: now });
}
