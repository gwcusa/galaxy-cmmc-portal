import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import controlsData from "@/data/nist-800-171-controls.json";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ControlRecord = {
  id: string;
  description: string;
  guidance?: string;
};

const controlsMap = new Map<string, ControlRecord>(
  (controlsData as ControlRecord[]).map((c) => [c.id, c])
);

const RESPONSE_LABELS: Record<string, string> = {
  yes: "Yes — Client claims full implementation",
  partial: "Partial — Client claims partial/in-progress implementation",
  no: "No — Client admits control is not implemented",
  na: "N/A — Client marked as not applicable",
};

const SYSTEM_PROMPT = `You are a strict, experienced CMMC Level 2 / NIST SP 800-171 third-party assessor (C3PAO). You are reviewing a defense contractor's self-assessment to determine whether their submitted evidence satisfies each control requirement well enough to pass a formal certification audit.

Your job is NOT to be encouraging or give the benefit of the doubt. Your job is to identify whether the control is genuinely implemented and documented, or whether there are gaps that would cause a finding in a real audit.

## CORE EVALUATION RULES

**Rule 1 — Intent ≠ Implementation**
Statements using future or aspirational language ("we plan to", "we are working on", "we intend to", "we will implement", "in progress") are NOT evidence of implementation. Rate these as "not_met" unless concurrent evidence of actual deployment exists.

**Rule 2 — Awareness ≠ Compliance**
Describing what a control requires, or stating general awareness of a policy area, is not the same as demonstrating the control is implemented. "We follow best practices" or "we comply with this requirement" without specifics is not_met.

**Rule 3 — Vague language fails the burden of proof**
Generic phrases like "we have security measures in place", "we use standard controls", "we have a process for this", or "our IT team handles this" do not satisfy any control. Evidence must name specific tools, systems, configurations, documented procedures with effective dates, or show specific measurable outcomes.

**Rule 4 — Specificity is the key test**
Ask yourself: could any organization write this note without actually implementing anything? If yes, the note is not_met. Good evidence names specific products (e.g., "Microsoft Intune MDM"), specific policies (e.g., "Password Policy v2.1, reviewed 03/2025"), specific configurations (e.g., "account lockout set to 5 attempts via Group Policy"), or specific logs/records.

**Rule 5 — Self-assessment response is a signal**
If the client marked "partial", they are themselves admitting incomplete implementation. Apply extra scrutiny. "Partial" with no artifacts and a vague note should almost always be "not_met" or at best "partially_met".

**Rule 6 — Artifacts carry significant weight**
Uploaded screenshots, policies, configuration exports, or logs can move a verdict from "partially_met" to "met" if they directly demonstrate the control. Generic filenames without relevant visible content are weaker evidence.

**Rule 7 — When in doubt, be conservative**
Between "met" and "partially_met": choose "partially_met".
Between "partially_met" and "not_met": lean "not_met" when notes are vague or generic.
Use "needs_review" when evidence exists but you cannot make a confident determination without human judgment (e.g., the client references an internal process you cannot verify, or the artifact is an unreadable format).
A false "met" causes audit failures. A false "not_met" prompts the client to improve documentation — a better outcome.

## VERDICT DEFINITIONS

- **"met"**: The control is demonstrably implemented today. Evidence is specific: named tools/systems in active use, documented policies with version and date, configuration screenshots showing active settings, or artifacts clearly proving the control is operational. A real C3PAO auditor would accept this.

- **"partially_met"**: Real evidence of partial implementation exists. The client references a relevant tool or process but lacks full coverage, specificity, or corroborating artifacts. Genuine progress is visible but gaps remain.

- **"not_met"**: No credible evidence of implementation. Notes are absent, vague, aspirational, or describe intent rather than current state. No relevant artifacts provided. The control is not satisfied.

- **"needs_review"**: Evidence exists but requires human assessor judgment to evaluate. Use this when Claude cannot make a confident determination from the available materials alone.

## OUTPUT FORMAT

Respond ONLY with a valid JSON object — no markdown, no extra text:

{
  "verdict": "met" | "partially_met" | "not_met" | "needs_review",
  "feedback": "3-5 sentences. Sentence 1: state the verdict and primary reason. Sentences 2-3: specific strengths (if any) and specific gaps or red flags. Final sentence: the single most important action needed to satisfy this control."
}`;

/**
 * Runs AI evidence review for a single control in an assessment.
 * Fetches control details, response, notes, and artifacts, then calls Claude.
 * Saves the result to control_ai_feedback.
 */
export async function runAiReview(
  assessmentId: string,
  controlId: string
): Promise<{ verdict: string; feedback: string }> {
  const control = controlsMap.get(controlId);
  if (!control) throw new Error(`Control not found: ${controlId}`);

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

  // Download and prepare artifact content
  const artifactContents: Array<{
    name: string;
    type: string;
    base64?: string;
    text?: string;
  }> = [];

  for (const artifact of artifacts ?? []) {
    const { data: blob } = await serviceClient.storage
      .from("artifacts")
      .download(artifact.storage_path);

    if (!blob) continue;

    const mimeType = artifact.mime_type ?? "";

    if (mimeType.startsWith("image/") || mimeType === "application/pdf") {
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      artifactContents.push({ name: artifact.file_name, type: mimeType, base64 });
    } else if (mimeType === "text/plain") {
      const text = await blob.text();
      artifactContents.push({ name: artifact.file_name, type: mimeType, text });
    } else {
      artifactContents.push({ name: artifact.file_name, type: mimeType });
    }
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const selfAssessedResponse = response?.response ?? "not_answered";
  const responseLabel = RESPONSE_LABELS[selfAssessedResponse] ?? selfAssessedResponse;
  const clientNotes = response?.notes?.trim() || null;
  const artifactList = artifacts ?? [];

  const analysisPrompt = `## Control Under Review

Control ID: ${controlId}
Control Requirement: ${control.description}
Implementation Guidance (what a compliant organization should have): ${control.guidance ?? "See NIST SP 800-171 Rev 2"}

---

## Client Submission

Self-Assessment Response: ${responseLabel}

Client Notes / Implementation Statement:
${clientNotes ? `"""\n${clientNotes}\n"""` : "(No notes provided — client left this blank)"}

Uploaded Evidence Artifacts: ${
    artifactList.length === 0
      ? "None uploaded"
      : artifactList.map((a) => a.file_name).join(", ")
  }

---

## Analysis Instructions

Apply each test to the client's notes and artifacts:

1. **Specificity test**: Do the notes name specific tools, systems, policies (with version/date), or configurations? Or are they generic?
2. **Present tense test**: Is the client describing what IS implemented today, or what they plan/intend to do?
3. **Completeness test**: Does the evidence address all aspects of the control, or only part?
4. **Artifact relevance test**: If artifacts were uploaded, do they directly demonstrate this specific control is active and configured?
5. **Audit credibility test**: Would a real C3PAO auditor accept this as sufficient evidence, or would they issue a finding?

Determine the verdict and write your JSON response.`;

  const contentParts: Anthropic.MessageParam["content"] = [
    { type: "text", text: analysisPrompt },
  ];

  for (const artifact of artifactContents) {
    if (artifact.base64 && artifact.type.startsWith("image/")) {
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: artifact.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: artifact.base64,
        },
      });
    } else if (artifact.base64 && artifact.type === "application/pdf") {
      contentParts.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: artifact.base64,
        },
      } as Anthropic.DocumentBlockParam);
    } else if (artifact.text) {
      contentParts.push({
        type: "text",
        text: `\n--- Uploaded file: ${artifact.name} ---\n${artifact.text}\n--- End of file ---`,
      });
    } else if (artifact.name) {
      contentParts.push({
        type: "text",
        text: `\n[Uploaded file: ${artifact.name} — binary format, filename noted but content not extractable]`,
      });
    }
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentParts }],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text.trim() : "";

  let verdict: "met" | "partially_met" | "not_met" | "needs_review" = "not_met";
  let feedback = "Unable to analyze evidence at this time. Please ensure notes are provided and re-submit.";

  try {
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonText);
    if (["met", "partially_met", "not_met", "needs_review"].includes(parsed.verdict)) {
      verdict = parsed.verdict;
    }
    feedback = parsed.feedback ?? feedback;
  } catch {
    if (rawText.includes('"met"') && !rawText.includes('"not_met"') && !rawText.includes('"partially_met"')) {
      verdict = "met";
    } else if (rawText.includes('"partially_met"')) {
      verdict = "partially_met";
    } else if (rawText.includes('"needs_review"')) {
      verdict = "needs_review";
    } else {
      verdict = "not_met";
    }
    const match = rawText.match(/"feedback"\s*:\s*"([^"]+)"/);
    if (match) feedback = match[1];
  }

  await serviceClient.from("control_ai_feedback").upsert(
    {
      assessment_id: assessmentId,
      control_id: controlId,
      feedback,
      verdict,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "assessment_id,control_id" }
  );

  return { verdict, feedback };
}
