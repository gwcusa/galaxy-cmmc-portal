import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import controlsData from "@/data/nist-800-171-controls.json";
import objectivesData from "@/data/assessment-objectives.json";
import { extractContent } from "@/lib/extract-text";
import { formatScopingForPrompt } from "@/lib/scoping-questions";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ControlRecord = {
  id: string;
  description: string;
  guidance?: string;
  weight: number;
};

type ObjectiveRecord = {
  discussion: string;
  examine: string;
  objectives: { id: string; text: string }[];
};

const controlsMap = new Map<string, ControlRecord>(
  (controlsData as ControlRecord[]).map((c) => [c.id, c])
);
const objectivesMap = objectivesData as Record<string, ObjectiveRecord>;

const RESPONSE_LABELS: Record<string, string> = {
  yes: "Yes — Client claims full implementation",
  partial: "Partial — Client claims partial/in-progress implementation",
  no: "No — Client admits control is not implemented",
  na: "N/A — Client marked as not applicable",
};

const MAX_FILES_PER_CONTROL = 5;

export const VERDICTS = ["met", "partially_met", "not_met", "needs_review"] as const;
export type Verdict = (typeof VERDICTS)[number];

export type ObjectiveResult = {
  id: string;
  met: "met" | "not_met" | "unclear";
  note: string;
};

const SYSTEM_PROMPT = `You are a strict, experienced CMMC Level 2 / NIST SP 800-171 third-party assessor (C3PAO). You are reviewing a defense contractor's self-assessment to determine whether their submitted evidence satisfies each control requirement well enough to pass a formal certification audit.

Your job is NOT to be encouraging or give the benefit of the doubt. Your job is to identify whether the control is genuinely implemented and documented, or whether there are gaps that would cause a finding in a real audit.

## HOW REAL ASSESSMENTS WORK

A CMMC assessor does not judge the requirement as a whole. Each requirement decomposes into NIST SP 800-171A assessment objectives, and EVERY objective must be MET for the requirement to be MET. You will be given the objectives for the control under review. Evaluate each objective independently against the evidence, then derive the overall verdict:
- All objectives met → "met"
- Some objectives met with real evidence → "partially_met"
- No objectives credibly met → "not_met"
- Evidence exists but you genuinely cannot judge without a human → "needs_review"

## CORE EVALUATION RULES

**Rule 1 — Intent ≠ Implementation**
Future or aspirational language ("we plan to", "we are working on", "we will implement", "in progress") is NOT evidence of implementation.

**Rule 2 — Awareness ≠ Compliance**
Describing what a control requires, or claiming general compliance, is not evidence the control is implemented.

**Rule 3 — Vague language fails the burden of proof**
"We have security measures in place", "our IT team handles this" — these satisfy nothing. Evidence must name specific tools, systems, configurations, documented procedures with dates, or measurable outcomes.

**Rule 4 — Specificity is the key test**
Could any organization write this note without actually implementing anything? If yes, it fails. Good evidence names specific products ("Microsoft Intune MDM"), specific policies ("Password Policy v2.1, reviewed 03/2025"), specific configurations ("lockout after 5 attempts via Group Policy").

**Rule 5 — Self-assessment response is a signal**
"Partial" is the client admitting incomplete implementation. Apply extra scrutiny.

**Rule 6 — Artifacts and documents carry significant weight**
Uploaded policies, screenshots, configuration exports, and logs can move objectives to met when they directly demonstrate the control. Weigh document content, not filenames.

**Rule 7 — Use the environment scoping profile**
The client's scoping profile describes their environment. Use it two ways:
(a) Consistency: if the profile contradicts the control notes (e.g., profile says no MFA product, notes claim MFA everywhere), flag it and be more skeptical.
(b) Applicability: if the control cannot apply to their environment (e.g., wireless controls when they operate no wireless networks), note this in your feedback — the assessor may mark it N/A. Still evaluate the objectives on the evidence as given.

**Rule 8 — When in doubt, be conservative**
Between met and partially_met, choose partially_met. Between partially_met and not_met, lean not_met. A false "met" causes audit failures; a false "not_met" prompts better documentation — a better outcome.

## OUTPUT

Report your evaluation with the report_control_verdict tool. For each assessment objective: whether it is met, not_met, or unclear from the evidence, with a one-sentence note. Then the overall verdict and 3-5 sentence feedback: verdict + primary reason, specific strengths and gaps, and the single most important action needed.`;

const VERDICT_TOOL: Anthropic.Tool = {
  name: "report_control_verdict",
  description: "Report the assessment verdict for this control.",
  input_schema: {
    type: "object" as const,
    properties: {
      objectives: {
        type: "array",
        description: "One entry per assessment objective, in the order given",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Objective ID, e.g. 3.1.1[a]" },
            met: { type: "string", enum: ["met", "not_met", "unclear"] },
            note: { type: "string", description: "One sentence: why" },
          },
          required: ["id", "met", "note"],
        },
      },
      verdict: { type: "string", enum: ["met", "partially_met", "not_met", "needs_review"] },
      feedback: {
        type: "string",
        description: "3-5 sentences: verdict + primary reason; specific strengths and gaps; single most important action needed.",
      },
    },
    required: ["objectives", "verdict", "feedback"],
  },
};

export type ReviewContext = {
  clientId: string;
  scopingText: string;
};

/** Loads per-assessment context shared by every control review (scoping profile, client id). */
export async function buildReviewContext(assessmentId: string): Promise<ReviewContext> {
  const { data: assessment } = await serviceClient
    .from("assessments")
    .select("client_id")
    .eq("id", assessmentId)
    .single();

  const { data: scoping } = await serviceClient
    .from("assessment_scoping")
    .select("answers")
    .eq("assessment_id", assessmentId)
    .single();

  return {
    clientId: assessment?.client_id ?? "",
    scopingText: formatScopingForPrompt((scoping?.answers as Record<string, unknown>) ?? {}),
  };
}

async function downloadAndExtract(
  bucket: string,
  path: string,
  mimeType: string | null,
  fileName: string
) {
  const { data: blob } = await serviceClient.storage.from(bucket).download(path);
  if (!blob) return null;
  const buffer = Buffer.from(await blob.arrayBuffer());
  return extractContent(buffer, mimeType, fileName);
}

function pushExtracted(
  parts: Anthropic.ContentBlockParam[],
  extracted: Awaited<ReturnType<typeof downloadAndExtract>>,
  label: string
) {
  if (!extracted) return;
  if (extracted.kind === "text") {
    parts.push({
      type: "text",
      text: `\n--- ${label} ---\n${extracted.text}${extracted.truncated ? "\n[content truncated]" : ""}\n--- end ---`,
    });
  } else if (extracted.kind === "image") {
    parts.push({ type: "text", text: `\n[${label} — image follows]` });
    parts.push({
      type: "image",
      source: { type: "base64", media_type: extracted.mediaType, data: extracted.base64 },
    });
  } else if (extracted.kind === "pdf") {
    parts.push({ type: "text", text: `\n[${label} — PDF follows]` });
    parts.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: extracted.base64 },
    } as Anthropic.DocumentBlockParam);
  } else {
    parts.push({ type: "text", text: `\n[${label} — binary format, content not extractable]` });
  }
}

/**
 * Runs the AI evidence review for a single control: response + notes +
 * per-control artifacts + confirmed library documents, evaluated per
 * 800-171A assessment objective. Saves verdict, feedback, and objective
 * results to control_ai_feedback.
 */
export async function runAiReview(
  assessmentId: string,
  controlId: string,
  ctx?: ReviewContext
): Promise<{ verdict: Verdict; feedback: string }> {
  const control = controlsMap.get(controlId);
  if (!control) throw new Error(`Control not found: ${controlId}`);
  const objInfo = objectivesMap[controlId];

  const context = ctx ?? (await buildReviewContext(assessmentId));

  const { data: response } = await serviceClient
    .from("assessment_responses")
    .select("response, notes")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .single();

  const { data: artifacts } = await serviceClient
    .from("artifacts")
    .select("file_name, storage_path, mime_type")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId);

  // Library documents the client confirmed as evidence for this control
  const { data: linkedDocs } = await serviceClient
    .from("document_control_links")
    .select("documents!inner(id, file_name, title, mime_type, storage_path, client_id)")
    .eq("control_id", controlId)
    .eq("status", "confirmed");

  const clientDocs = (linkedDocs ?? [])
    .map((l) => (Array.isArray(l.documents) ? l.documents[0] : l.documents))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .filter((d) => (d as { client_id: string }).client_id === context.clientId);

  const selfAssessedResponse = response?.response ?? "not_answered";
  const responseLabel = RESPONSE_LABELS[selfAssessedResponse] ?? selfAssessedResponse;
  const clientNotes = response?.notes?.trim() || null;

  const objectiveList = (objInfo?.objectives ?? [])
    .map((o) => `- ${o.id}: ${o.text}`)
    .join("\n");

  const analysisPrompt = `## Control Under Review

Control ID: ${controlId} (NIST SP 800-171 Rev 2, DoD point value: ${control.weight})
Requirement: ${control.description}
${objInfo?.discussion ? `\nDiscussion (from NIST SP 800-171):\n${objInfo.discussion.slice(0, 1500)}\n` : ""}
### Assessment objectives (NIST SP 800-171A) — evaluate each one:
${objectiveList || "(none — evaluate the requirement as a whole)"}
${objInfo?.examine ? `\nTypical evidence an assessor examines: ${objInfo.examine.slice(0, 600)}` : ""}

---

## Client Submission

Self-Assessment Response: ${responseLabel}

Client Notes / Implementation Statement:
${clientNotes ? `"""\n${clientNotes}\n"""` : "(No notes provided — client left this blank)"}

Attached evidence follows (per-control uploads first, then library documents the client mapped to this control).`;

  const contentParts: Anthropic.ContentBlockParam[] = [
    { type: "text", text: analysisPrompt },
  ];

  let fileBudget = MAX_FILES_PER_CONTROL;
  for (const artifact of artifacts ?? []) {
    if (fileBudget-- <= 0) break;
    const extracted = await downloadAndExtract("artifacts", artifact.storage_path, artifact.mime_type, artifact.file_name);
    pushExtracted(contentParts, extracted, `Uploaded artifact: ${artifact.file_name}`);
  }
  for (const doc of clientDocs) {
    if (fileBudget-- <= 0) break;
    const d = doc as { file_name: string; title: string | null; mime_type: string | null; storage_path: string };
    const extracted = await downloadAndExtract("documents", d.storage_path, d.mime_type, d.file_name);
    pushExtracted(contentParts, extracted, `Library document: ${d.title ?? d.file_name}`);
  }
  if ((artifacts ?? []).length === 0 && clientDocs.length === 0) {
    contentParts.push({ type: "text", text: "\n(No artifacts or documents attached for this control.)" });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    // Two cached system blocks: the static assessor prompt (cache hit across all
    // assessments) and the per-assessment scoping profile (cache hit across the
    // ~110 control reviews in one run).
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      {
        type: "text",
        text: `## Client Environment Scoping Profile\n${context.scopingText}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [VERDICT_TOOL],
    tool_choice: { type: "tool", name: "report_control_verdict" },
    messages: [{ role: "user", content: contentParts }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;

  let verdict: Verdict = "needs_review";
  let feedback = "The automated review did not return a usable result. A human assessor should evaluate this control.";
  let objectiveResults: ObjectiveResult[] = [];

  if (toolUse) {
    const input = toolUse.input as {
      objectives?: ObjectiveResult[];
      verdict?: string;
      feedback?: string;
    };
    if (input.verdict && (VERDICTS as readonly string[]).includes(input.verdict)) {
      verdict = input.verdict as Verdict;
    }
    if (input.feedback) feedback = input.feedback;
    objectiveResults = (input.objectives ?? []).filter(
      (o) => o && typeof o.id === "string" && ["met", "not_met", "unclear"].includes(o.met)
    );

    // Enforce the 171A rule: a control is only "met" when every objective is met.
    if (verdict === "met" && objectiveResults.some((o) => o.met !== "met")) {
      verdict = "partially_met";
    }
  }

  await serviceClient.from("control_ai_feedback").upsert(
    {
      assessment_id: assessmentId,
      control_id: controlId,
      feedback,
      verdict,
      objective_results: objectiveResults.length > 0 ? objectiveResults : null,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "assessment_id,control_id" }
  );

  return { verdict, feedback };
}
