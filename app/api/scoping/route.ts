import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

async function authorizeAssessment(assessmentId: string, userId: string) {
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userId).single();
  const isAdmin = role?.role === "admin";

  const { data: assessment } = await svc
    .from("assessments")
    .select("id, status, clients(user_id)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return { svc, allowed: false, isAdmin, status: null as string | null };

  const owner = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  const allowed = isAdmin || (owner as { user_id: string } | null)?.user_id === userId;
  return { svc, allowed, isAdmin, status: assessment.status as string };
}

// GET /api/scoping?assessmentId=xxx
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { svc, allowed } = await authorizeAssessment(assessmentId, user.id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await svc
    .from("assessment_scoping")
    .select("answers, updated_at")
    .eq("assessment_id", assessmentId)
    .single();

  return NextResponse.json({ answers: data?.answers ?? {}, updated_at: data?.updated_at ?? null });
}

// POST /api/scoping { assessmentId, answers }
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId, answers } = await req.json();
  if (!assessmentId || typeof answers !== "object" || answers === null) {
    return NextResponse.json({ error: "assessmentId and answers required" }, { status: 400 });
  }

  const { svc, allowed, isAdmin, status } = await authorizeAssessment(assessmentId, user.id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Clients can only edit scoping while the assessment is editable
  if (!isAdmin && status && !["in_progress", "remediation_required"].includes(status)) {
    return NextResponse.json({ error: "Assessment is not editable in its current state" }, { status: 400 });
  }

  const { error } = await svc.from("assessment_scoping").upsert(
    { assessment_id: assessmentId, answers, updated_at: new Date().toISOString() },
    { onConflict: "assessment_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
