import { createClient } from "@supabase/supabase-js";
import { runAiReview, buildReviewContext } from "@/lib/run-ai-review";
import { runSynthesis } from "@/lib/run-synthesis";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONCURRENCY = 4;
const RETRIES = 1;

/**
 * Orchestrates a full AI review of an assessment: every yes/partial control is
 * reviewed (bounded concurrency, one retry), progress is tracked in
 * ai_review_runs, and an engagement-level synthesis runs at the end.
 *
 * Returns the run id immediately-usable for progress polling.
 */
export async function runAssessmentReview(
  assessmentId: string,
  startedBy?: string
): Promise<{ runId: string; total: number }> {
  const { data: responses } = await serviceClient
    .from("assessment_responses")
    .select("control_id")
    .eq("assessment_id", assessmentId)
    .in("response", ["yes", "partial"]);

  const controlIds = (responses ?? []).map((r) => r.control_id);

  const { data: run, error } = await serviceClient
    .from("ai_review_runs")
    .insert({
      assessment_id: assessmentId,
      status: "running",
      total_controls: controlIds.length,
      started_by: startedBy ?? null,
    })
    .select("id")
    .single();
  if (error || !run) throw new Error(`Could not create review run: ${error?.message}`);

  return { runId: run.id, total: controlIds.length };
}

/** The long-running part — call inside waitUntil() after runAssessmentReview(). */
export async function executeReviewRun(runId: string, assessmentId: string): Promise<void> {
  const { data: responses } = await serviceClient
    .from("assessment_responses")
    .select("control_id")
    .eq("assessment_id", assessmentId)
    .in("response", ["yes", "partial"]);

  const controlIds = (responses ?? []).map((r) => r.control_id);
  const context = await buildReviewContext(assessmentId);

  let completed = 0;
  let failed = 0;

  async function reviewWithRetry(controlId: string): Promise<void> {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        await runAiReview(assessmentId, controlId, context);
        completed++;
        return;
      } catch (err) {
        if (attempt === RETRIES) {
          failed++;
          console.error(`AI review failed for ${controlId}:`, err);
        }
      }
    }
  }

  // Bounded-concurrency worker pool; counters flushed to the run row as we go
  const queue = [...controlIds];
  async function worker() {
    while (queue.length > 0) {
      const controlId = queue.shift();
      if (!controlId) return;
      await reviewWithRetry(controlId);
      await serviceClient
        .from("ai_review_runs")
        .update({ completed_controls: completed, failed_controls: failed })
        .eq("id", runId);
    }
  }

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    await runSynthesis(assessmentId);
    await serviceClient
      .from("ai_review_runs")
      .update({
        status: "completed",
        completed_controls: completed,
        failed_controls: failed,
        synthesis_done: true,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  } catch (err) {
    console.error("Review run failed:", err);
    await serviceClient
      .from("ai_review_runs")
      .update({
        status: "failed",
        completed_controls: completed,
        failed_controls: failed,
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}
