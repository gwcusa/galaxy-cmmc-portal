import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { runAiReview } from "@/lib/run-ai-review";

// POST /api/admin/assessment/[id]/run-ai
// Triggers AI analysis for all yes/partial controls that are missing feedback.
// Admin-only.
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
  const { data: roleRow, error: roleError } = await serviceSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  console.log("[run-ai] user:", user.id, "role:", roleRow?.role, "roleError:", roleError?.message);
  if (roleRow?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — role: " + (roleRow?.role ?? "none") }, { status: 403 });
  }

  const assessmentId = params.id;

  // Get all yes/partial responses for this assessment
  const { data: responses } = await serviceSupabase
    .from("assessment_responses")
    .select("control_id")
    .eq("assessment_id", assessmentId)
    .in("response", ["yes", "partial"]);

  if (!responses || responses.length === 0) {
    return NextResponse.json({ queued: 0, message: "No yes/partial controls to analyze." });
  }

  // Get controls that already have AI feedback
  const { data: existing } = await serviceSupabase
    .from("control_ai_feedback")
    .select("control_id")
    .eq("assessment_id", assessmentId);

  const existingSet = new Set((existing ?? []).map((r) => r.control_id));

  // Re-run all (including existing) when called manually — assessor wants fresh analysis
  const controlIds = responses.map((r) => r.control_id);

  waitUntil(
    Promise.allSettled(
      controlIds.map((controlId) =>
        runAiReview(assessmentId, controlId).catch((err) => {
          console.error(`AI review failed for control ${controlId}:`, err);
        })
      )
    )
  );

  const newCount = controlIds.filter((id) => !existingSet.has(id)).length;
  const rerunCount = controlIds.length - newCount;

  return NextResponse.json({
    queued: controlIds.length,
    new: newCount,
    rerun: rerunCount,
    message: `AI analysis queued for ${controlIds.length} control(s). Results will appear within a few minutes.`,
  });
}
