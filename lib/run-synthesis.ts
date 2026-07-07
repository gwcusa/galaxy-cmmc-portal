import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { getControlsForLevel } from "@/lib/controls";
import { buildReviewContext } from "@/lib/run-ai-review";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUMMARY_TOOL: Anthropic.Tool = {
  name: "report_assessment_summary",
  description: "Report the engagement-level CMMC readiness assessment.",
  input_schema: {
    type: "object" as const,
    properties: {
      overall_verdict: {
        type: "string",
        enum: ["ready", "conditional", "not_ready"],
        description:
          "ready = would pass a C3PAO assessment today; conditional = close, POA&M-eligible gaps only; not_ready = material gaps remain",
      },
      narrative: {
        type: "string",
        description:
          "3-5 paragraphs for the assessor: does this client meet CMMC requirements, why or why not. Reference specific controls and evidence quality. Written in professional assessment language.",
      },
      top_blockers: {
        type: "array",
        description: "The most important gaps standing between the client and certification, most severe first (max 10)",
        items: {
          type: "object",
          properties: {
            control_id: { type: "string" },
            issue: { type: "string", description: "What is wrong, one sentence" },
            impact: { type: "string", description: "Why it matters (point value, audit consequence), one sentence" },
          },
          required: ["control_id", "issue", "impact"],
        },
      },
      contradictions: {
        type: "array",
        description: "Cross-control inconsistencies in the client's submission (claims that conflict with each other or with the scoping profile)",
        items: {
          type: "object",
          properties: {
            controls: { type: "array", items: { type: "string" } },
            description: { type: "string" },
          },
          required: ["controls", "description"],
        },
      },
      domain_notes: {
        type: "array",
        description: "One entry per 800-171 family with a notable finding (skip unremarkable families)",
        items: {
          type: "object",
          properties: {
            domain_code: { type: "string" },
            status: { type: "string", enum: ["strong", "mixed", "weak"] },
            note: { type: "string" },
          },
          required: ["domain_code", "status", "note"],
        },
      },
    },
    required: ["overall_verdict", "narrative", "top_blockers", "contradictions", "domain_notes"],
  },
};

/**
 * Engagement-level synthesis: runs after per-control reviews finish. Aggregates
 * every verdict, the SPRS score, and the scoping profile into a single
 * "meets / doesn't meet, why" determination stored in assessment_summaries.
 */
export async function runSynthesis(assessmentId: string): Promise<void> {
  const { data: assessment } = await serviceClient
    .from("assessments")
    .select("id, client_id, clients(company_name, cmmc_target_level)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) throw new Error("Assessment not found");

  const client = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  const targetLevel = ((client as { cmmc_target_level?: number } | null)?.cmmc_target_level ?? 2) as 1 | 2;
  const companyName = (client as { company_name?: string } | null)?.company_name ?? "the client";

  const [{ data: responses }, { data: aiFeedback }, { data: determinations }] = await Promise.all([
    serviceClient
      .from("assessment_responses")
      .select("control_id, response, notes")
      .eq("assessment_id", assessmentId),
    serviceClient
      .from("control_ai_feedback")
      .select("control_id, verdict, feedback")
      .eq("assessment_id", assessmentId),
    serviceClient
      .from("assessor_determinations")
      .select("control_id, assessor_verdict")
      .eq("assessment_id", assessmentId),
  ]);

  const responseMap: ResponseMap = {};
  const notesMap = new Map<string, string | null>();
  for (const r of responses ?? []) {
    responseMap[r.control_id] = r.response as ResponseMap[string];
    notesMap.set(r.control_id, r.notes);
  }
  const aiMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f]));
  const detMap = new Map((determinations ?? []).map((d) => [d.control_id, d.assessor_verdict]));

  const score = calculateScore(responseMap, targetLevel);
  const controls = getControlsForLevel(targetLevel);

  // Compact per-control table for the prompt
  const controlLines = controls.map((c) => {
    const response = responseMap[c.id] ?? "unanswered";
    const verdict = detMap.get(c.id) ?? aiMap.get(c.id)?.verdict ?? "(no review)";
    const fb = aiMap.get(c.id)?.feedback?.slice(0, 220) ?? "";
    const notes = notesMap.get(c.id)?.slice(0, 150) ?? "";
    return `${c.id} [${c.weight}pt] client:${response} verdict:${verdict}${notes ? ` | notes: ${notes}` : ""}${fb ? ` | review: ${fb}` : ""}`;
  });

  const context = await buildReviewContext(assessmentId);

  const sprsText = score.sprs
    ? `SPRS score (DoD Assessment Methodology): ${score.sprs.scoreable ? score.sprs.score : "NOT SCOREABLE — no SSP (3.12.4)"} of 110.
POA&M eligible for CMMC Level 2 Conditional status: ${score.sprs.poamEligible ? "YES" : "NO"}${score.sprs.poamBlockers.length > 0 ? ` (blockers on 3/5-point items: ${score.sprs.poamBlockers.join(", ")})` : ""}.
Unanswered controls: ${score.sprs.unansweredCount}.`
    : `CMMC Level 1 engagement (17 FAR practices) — no SPRS score; all practices must be MET (no POA&M permitted at Level 1).`;

  const prompt = `You are the lead assessor at a CMMC RPO reviewing the complete assessment picture for ${companyName} (CMMC Level ${targetLevel} target).

## Environment scoping profile
${context.scopingText}

## Computed scoring (authoritative — do not recalculate)
${sprsText}
Implementation counts: ${score.passed} yes, ${score.partial} partial, ${score.gaps} no.

## Per-control picture (client self-assessment response + automated evidence review verdict)
${controlLines.join("\n")}

## Your task
Produce the engagement-level readiness assessment with the report_assessment_summary tool:
1. overall_verdict: ready / conditional / not_ready. "conditional" only makes sense at Level 2 when the SPRS data above says POA&M-eligible. At Level 1 every practice must be met.
2. narrative: does ${companyName} meet the requirements — why or why not. Be specific about the strongest and weakest areas, evidence quality patterns (e.g., vague notes, missing artifacts), and what a C3PAO would find.
3. top_blockers: the gaps that matter most (weigh 5-point items and foundational controls like the SSP heavily).
4. contradictions: cross-control inconsistencies — claims in one control's notes that conflict with another control's notes or with the scoping profile.
5. domain_notes: families worth calling out, strong or weak.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: "report_assessment_summary" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!toolUse) throw new Error("Synthesis produced no result");

  const result = toolUse.input as {
    overall_verdict: "ready" | "conditional" | "not_ready";
    narrative: string;
    top_blockers: unknown[];
    contradictions: unknown[];
    domain_notes: unknown[];
  };

  await serviceClient.from("assessment_summaries").upsert(
    {
      assessment_id: assessmentId,
      overall_verdict: ["ready", "conditional", "not_ready"].includes(result.overall_verdict)
        ? result.overall_verdict
        : "not_ready",
      narrative: result.narrative ?? "",
      sprs_estimate: score.sprs?.scoreable ? score.sprs.score : null,
      poam_eligible: score.sprs?.poamEligible ?? null,
      domain_rollups: result.domain_notes ?? [],
      top_blockers: result.top_blockers ?? [],
      contradictions: result.contradictions ?? [],
      generated_at: new Date().toISOString(),
    },
    { onConflict: "assessment_id" }
  );
}
