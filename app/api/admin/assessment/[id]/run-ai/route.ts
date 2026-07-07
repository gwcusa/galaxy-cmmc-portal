import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { runAssessmentReview, executeReviewRun } from "@/lib/run-assessment-review";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300;

// POST /api/admin/assessment/[id]/run-ai
// Starts a tracked AI review run (all yes/partial controls + synthesis).
// Admin-only. Poll /run-status for progress.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user }, error: userError } = await authSupabase.auth.getUser();
  if (userError || !user) {
    console.error("[run-ai] getUser failed:", userError?.message);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceSupabase = createServiceSupabaseClient();

  // Admin check
  const { data: roleRow } = await serviceSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (roleRow?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assessmentId = params.id;

  // Don't stack runs
  const { data: activeRun } = await serviceSupabase
    .from("ai_review_runs")
    .select("id")
    .eq("assessment_id", assessmentId)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (activeRun) {
    return NextResponse.json({ runId: activeRun.id, message: "A review run is already in progress." });
  }

  const { runId, total } = await runAssessmentReview(assessmentId, user.id);
  if (total === 0) {
    await serviceSupabase
      .from("ai_review_runs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", runId);
    return NextResponse.json({ runId, queued: 0, message: "No yes/partial controls to analyze." });
  }

  waitUntil(executeReviewRun(runId, assessmentId));

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "review_run.started",
    entityType: "assessment",
    entityId: assessmentId,
    metadata: { runId, controls: total },
  });

  return NextResponse.json({
    runId,
    queued: total,
    message: `Review started for ${total} control(s).`,
  });
}
