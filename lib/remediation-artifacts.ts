import Anthropic from "@anthropic-ai/sdk";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { DOMAINS, getControlsForLevel } from "@/lib/controls";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { formatScopingForPrompt } from "@/lib/scoping-questions";

const MODEL = "claude-sonnet-4-6";

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type ArtifactType =
  | "ssp"
  | "poam"
  | "policy_template"
  | "config_baseline"
  | "responsibility_matrix";

export const ARTIFACT_TITLES: Record<ArtifactType, string> = {
  ssp: "System Security Plan (SSP)",
  poam: "Plan of Action & Milestones (POA&M)",
  policy_template: "Policy & Procedure Templates",
  config_baseline: "Configuration Baseline",
  responsibility_matrix: "Customer Responsibility Matrix (CRM)",
};

export type ControlContext = {
  id: string;
  description: string;
  guidance: string;
  weight: number;
  domainCode: string;
  response: string;
  verdict: string;
  notes: string | null;
  intakeAnswers: string | null;
};

export type EngagementContext = {
  companyName: string;
  level: 1 | 2;
  scopingText: string;
  documentList: string;
  controls: ControlContext[];
  score: ReturnType<typeof calculateScore>;
};

/** A generated deliverable plus the controls it addresses. */
export type GeneratedArtifact = { content: string; coversControls: string[] };

/** Gaps an artifact should remediate: anything not credibly met. */
export function computeGaps(ctx: EngagementContext): ControlContext[] {
  return ctx.controls.filter(
    (c) => ["not_met", "partially_met", "needs_review"].includes(c.verdict) || c.response === "no"
  );
}

export async function buildContext(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  assessmentId: string,
  clientId: string,
  companyName: string,
  level: 1 | 2
): Promise<EngagementContext> {
  const [
    { data: responses },
    { data: determinations },
    { data: aiFeedback },
    { data: scoping },
    { data: intake },
    { data: documents },
  ] = await Promise.all([
    svc.from("assessment_responses").select("control_id, response, notes").eq("assessment_id", assessmentId),
    svc.from("assessor_determinations").select("control_id, assessor_verdict, assessor_notes").eq("assessment_id", assessmentId),
    svc.from("control_ai_feedback").select("control_id, verdict").eq("assessment_id", assessmentId),
    svc.from("assessment_scoping").select("answers").eq("assessment_id", assessmentId).maybeSingle(),
    svc.from("information_requests").select("control_id, questions, answers").eq("assessment_id", assessmentId).in("request_type", ["ai_intake", "ai_intake_package"]).not("answers", "is", null),
    svc.from("documents").select("title, file_name, doc_type").eq("client_id", clientId),
  ]);

  const responseMap = new Map((responses ?? []).map((r) => [r.control_id, r]));
  const detMap = new Map((determinations ?? []).map((d) => [d.control_id, d]));
  const aiMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f]));

  // Flatten intake Q/A into readable text per control. Per-control requests are
  // tied via control_id; consolidated (package) requests tag each question with
  // a `controls` array, so an answer can inform several controls at once.
  const intakeByControl = new Map<string, string[]>();
  const pushIntake = (controlId: string, text: string) => {
    if (!text) return;
    const arr = intakeByControl.get(controlId) ?? [];
    arr.push(text);
    intakeByControl.set(controlId, arr);
  };
  for (const req of intake ?? []) {
    const questions = (req.questions ?? []) as { id: string; question: string; controls?: string[] }[];
    const answers = (req.answers ?? {}) as Record<string, string>;
    for (const q of questions) {
      const answer = answers[q.id];
      if (!answer) continue;
      const qa = `Q: ${q.question}\nA: ${answer}`;
      const targets = q.controls?.length ? q.controls : req.control_id ? [req.control_id] : [];
      for (const t of targets) pushIntake(t, qa);
    }
  }

  const levelControls = getControlsForLevel(level);
  const controls: ControlContext[] = levelControls.map((c) => {
    const r = responseMap.get(c.id);
    const det = detMap.get(c.id);
    const ai = aiMap.get(c.id);
    const verdict =
      det?.assessor_verdict ?? ai?.verdict ?? (r?.response === "no" ? "not_met" : r ? "needs_review" : "not_answered");
    return {
      id: c.id,
      description: c.description,
      guidance: c.guidance ?? "",
      weight: c.weight,
      domainCode: c.domain_code,
      response: r?.response ?? "not_answered",
      verdict,
      notes: det?.assessor_notes ?? r?.notes ?? null,
      intakeAnswers: intakeByControl.get(c.id)?.join("\n") ?? null,
    };
  });

  const responseMapForScore: ResponseMap = {};
  for (const r of responses ?? []) responseMapForScore[r.control_id] = r.response as ResponseMap[string];

  return {
    companyName,
    level,
    scopingText: formatScopingForPrompt((scoping?.answers as Record<string, unknown>) ?? {}),
    documentList:
      (documents ?? [])
        .map((d) => `- ${d.title ?? d.file_name}${d.doc_type ? ` (${d.doc_type})` : ""}`)
        .join("\n") || "(none on file)",
    controls,
    score: calculateScore(responseMapForScore, level),
  };
}

export function controlLine(c: ControlContext): string {
  return [
    `${c.id} [${c.weight}pt]: ${c.description}`,
    `  Status: ${c.verdict.replace(/_/g, " ")} (client answered: ${c.response})`,
    c.notes ? `  Notes: ${c.notes.slice(0, 400)}` : null,
    c.intakeAnswers ? `  Intake answers:\n${c.intakeAnswers.split("\n").map((l) => "    " + l).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function sharedSystemBlock(ctx: EngagementContext): Anthropic.TextBlockParam {
  return {
    type: "text",
    text: `You are a CMMC/NIST SP 800-171 compliance specialist at a Registered Provider Organization, drafting deliverables for the defense contractor below. Ground everything in the client's actual environment and answers — never invent tools, staff, or processes they have not described. Where a fact is genuinely unknown, insert a bracketed placeholder like [OWNER: verify].

## Client
Company: ${ctx.companyName}
CMMC Target Level: ${ctx.level}

## Environment scoping profile
${ctx.scopingText}

## Documents on file
${ctx.documentList}`,
    cache_control: { type: "ephemeral" },
  };
}

async function generateText(
  system: Anthropic.TextBlockParam[],
  prompt: string,
  maxTokens = 4096
): Promise<string> {
  const message = await client().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0]?.type === "text" ? message.content[0].text : "";
}

/** Run an async worker pool over items with bounded concurrency, preserving order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()));
  return out;
}

export async function generateSSP(ctx: EngagementContext): Promise<GeneratedArtifact> {
  const system = [sharedSystemBlock(ctx)];
  const families = DOMAINS.filter((d) => ctx.controls.some((c) => c.domainCode === d.code));

  const intro = await generateText(
    system,
    `Write the opening sections of a System Security Plan for ${ctx.companyName}:
1. "1. System Identification" — system name, owner placeholder, CMMC Level ${ctx.level} scope, based on the scoping profile.
2. "2. System Description & Environment" — 2-3 paragraphs describing the environment, CUI/FCI flows, and system boundary from the scoping profile.
3. "3. Roles & Responsibilities" — short table-style list with placeholders where names are unknown.
Use markdown headings. Do not write control implementation statements yet.`,
    2048
  );

  const sections = await mapPool(families, 3, async (family) => {
    const familyControls = ctx.controls.filter((c) => c.domainCode === family.code);
    return generateText(
      system,
      `Write the "${family.name} (${family.code})" section of the SSP: one Control Implementation Statement per requirement below.

Format per control:
**[${family.code}] <control id> — <8-word-max short name>**
*Status: Implemented / Partially Implemented / Not Implemented / Not Applicable*
2-4 sentences describing how ${ctx.companyName} addresses the requirement TODAY, grounded strictly in the status, notes, and intake answers. For "not implemented" controls write one honest sentence stating it is not yet implemented and referencing the POA&M. For placeholders use [brackets].

## Requirements and client data
${familyControls.map(controlLine).join("\n\n")}`,
      3072
    );
  });

  const content = [
    `# System Security Plan — ${ctx.companyName}`,
    `*CMMC Level ${ctx.level} · NIST SP 800-171 Rev 2 · Generated draft — requires assessor review*`,
    "",
    intro,
    "## 4. Control Implementation Statements",
    ...sections,
  ].join("\n\n");
  return { content, coversControls: ctx.controls.map((c) => c.id) };
}

export async function generatePOAM(ctx: EngagementContext): Promise<GeneratedArtifact> {
  const gaps = computeGaps(ctx);
  const sprs = ctx.score.sprs;

  // Split gaps by whether they can legally ride on a POA&M for CMMC Conditional
  // Level 2 status (32 CFR 170.21). Blockers must be MET before assessment.
  const blockerSet = new Set(sprs?.poamBlockers ?? []);
  const mustFix = gaps.filter((c) => blockerSet.has(c.id));
  const deferrable = gaps.filter((c) => !blockerSet.has(c.id));

  const eligibilityNote = sprs
    ? `Current SPRS score: ${sprs.scoreable ? sprs.score : "not scoreable (no SSP)"} of 110. Eligible for CMMC Conditional Level 2 status via POA&M: ${sprs.poamEligible ? "yes" : "no"}${sprs.poamEligible ? "" : ` — because ${!sprs.scoreable ? "no System Security Plan is in place" : sprs.score < 88 ? "the score is below the 88/110 (80%) minimum" : "one or more gaps cannot be placed on a POA&M (see the Must-Fix section)"}`}.

The following ${mustFix.length} requirement(s) CANNOT be placed on a POA&M per 32 CFR 170.21 and MUST be fully implemented BEFORE the assessment (they are 3- or 5-point requirements, or one of the six mandatory 1-point requirements — external connections 3.1.20, control of public information 3.1.22, the SSP 3.12.4, and physical-access controls 3.10.3/3.10.4/3.10.5):
${mustFix.map((c) => `- ${c.id} [${c.weight}pt]`).join("\n") || "- (none)"}`
    : "CMMC Level 1: all 17 practices must be MET — no POA&M is permitted for certification, so frame this as an internal remediation plan.";

  const body = await generateText(
    [sharedSystemBlock(ctx)],
    `Write a formal Plan of Action & Milestones (POA&M) for ${ctx.companyName}.

${eligibilityNote}

## MUST-FIX gaps — required BEFORE assessment (not POA&M-eligible)
${mustFix.map(controlLine).join("\n\n") || "(None)"}

## POA&M-eligible gaps — may be deferred up to 180 days
${deferrable.map(controlLine).join("\n\n") || "(None)"}

## Instructions
1. Brief introduction (purpose, scope, current score, and the 180-day POA&M closeout rule).
2. First a **"Must Fix Before Assessment"** section listing the not-POA&M-eligible gaps above — make clear these block even Conditional status and give them the shortest timelines (30 days).
3. Then the **"POA&M Items"** section: one entry per deferrable gap: **Item #**, **Control** (id + description), **Weakness/Gap** (specific, from the notes/intake), **Recommended Remediation** (3-5 concrete bullet steps referencing their actual tools from the scoping profile), **Responsible Party**, **Target Completion** (within 180 days; higher-weight items first with shorter timelines), **Resources Required**.
4. Closing summary table: item, control, points at stake, POA&M-eligible (yes/no), target date.
Use markdown. Be specific and realistic. Never tell the client a must-fix gap can be deferred.`,
    8192
  );
  return { content: `# Plan of Action & Milestones — ${ctx.companyName}\n\n${body}`, coversControls: gaps.map((c) => c.id) };
}

const FAMILY_TO_POLICY: Record<string, string> = {
  AC: "Access Control Policy",
  AT: "Security Awareness and Training Policy",
  AU: "Audit and Accountability Policy",
  CM: "Configuration Management Policy",
  IA: "Identification and Authentication Policy",
  IR: "Incident Response Policy",
  MA: "System Maintenance Policy",
  MP: "Media Protection Policy",
  PS: "Personnel Security Policy",
  PE: "Physical Protection Policy",
  RA: "Risk Assessment Policy",
  CA: "Security Assessment Policy",
  SC: "System and Communications Protection Policy",
  SI: "System and Information Integrity Policy",
};

export async function generatePolicies(ctx: EngagementContext): Promise<GeneratedArtifact> {
  const gaps = ctx.controls.filter((c) => ["not_met", "partially_met"].includes(c.verdict) || c.response === "no");
  const gapFamilies = Array.from(new Set(gaps.map((c) => c.domainCode)));
  const neededPolicies = gapFamilies.map((f) => FAMILY_TO_POLICY[f]).filter(Boolean).slice(0, 4);
  const policyFamilies = neededPolicies.length > 0 ? gapFamilies.slice(0, 4) : ["AC", "IR", "CM"];
  const policyList =
    neededPolicies.length > 0 ? neededPolicies : ["Access Control Policy", "Incident Response Policy", "Configuration Management Policy"];

  const body = await generateText(
    [sharedSystemBlock(ctx)],
    `Generate the following policy templates for ${ctx.companyName}, targeting the gap areas below:
${policyList.map((p) => `- ${p}`).join("\n")}

## Gaps these policies must cover
${gaps.slice(0, 20).map(controlLine).join("\n\n")}

## Format per policy
# <POLICY NAME>
Version 1.0 | Effective Date: [DATE] | Review: annually
1. **Purpose**  2. **Scope**  3. **Policy Statements** (8-12 numbered, enforceable, referencing the client's actual tools from the scoping profile where known)  4. **Roles & Responsibilities**  5. **Procedures** (step-by-step for the most critical activities)  6. **Compliance & Review**

Write all policies now, in full, using markdown.`,
    8192
  );
  // The policy bundle is the "policy exists" evidence for the gap controls in
  // the families it covers.
  const covered = gaps.filter((c) => policyFamilies.includes(c.domainCode)).map((c) => c.id);
  return { content: body, coversControls: covered };
}

export async function generateConfigBaseline(ctx: EngagementContext, controlId: string): Promise<GeneratedArtifact> {
  const control = ctx.controls.find((c) => c.id === controlId);
  if (!control) throw new Error("Control not in scope");
  const body = await generateText(
    [sharedSystemBlock(ctx)],
    `Write a practical configuration baseline/implementation guide that closes the gap on control ${control.id} for ${ctx.companyName}.

## The gap
${controlLine(control)}

## Instructions
Target THEIR stack (from the scoping profile — e.g., if they run Microsoft 365, give M365/Intune/Entra steps; if on-prem AD, give Group Policy steps). Structure:
1. **Objective** — what this configuration achieves for ${control.id}.
2. **Prerequisites** — licenses, roles, access needed.
3. **Step-by-step configuration** — numbered, concrete (portal paths, policy names, exact recommended values).
4. **Validation** — how to verify it works and what evidence to capture for the assessor (screenshots/exports to upload).
5. **Ongoing maintenance** — review cadence.
Use markdown. Where their stack is unknown for a step, give the Microsoft 365 Business Premium default and mark it [verify platform].`,
    4096
  );
  return { content: `# Configuration Baseline — ${control.id}\n*${control.description}*\n\n${body}`, coversControls: [control.id] };
}

export async function generateResponsibilityMatrix(ctx: EngagementContext): Promise<GeneratedArtifact> {
  const system = [sharedSystemBlock(ctx)];
  const families = DOMAINS.filter((d) => ctx.controls.some((c) => c.domainCode === d.code));

  const intro = await generateText(
    system,
    `Write a 2-paragraph introduction to a Customer Responsibility Matrix (CRM, also called a Shared Responsibility Matrix) for ${ctx.companyName}. Explain, grounded in the scoping profile, which parties share responsibility for the CMMC Level ${ctx.level} security requirements — the client itself, their managed service provider (MSP/ESP) if any, and their cloud/SaaS provider(s) (e.g., Microsoft for GCC High). Note that for any requirement delegated to an external provider, the client must still verify it through a contract, SLA, or the provider's own shared-responsibility documentation. Use markdown. Do not write the table yet.`,
    1024
  );

  const sections = await mapPool(families, 3, async (family) => {
    const familyControls = ctx.controls.filter((c) => c.domainCode === family.code);
    return generateText(
      system,
      `Write the "${family.name} (${family.code})" section of a Customer Responsibility Matrix as a markdown table with these columns:
| Control | Requirement (short) | Responsible Party | How the responsibility is met / what the client must verify |

Responsible Party must be one of: **Client**, **MSP/ESP**, **Cloud Provider (CSP)**, or **Shared**. Decide it from the scoping profile — who manages IT, which cloud platforms they use, and the nature of each requirement. Physical, personnel, policy and training requirements are almost always the Client's. Infrastructure, logging, and platform-crypto requirements are often Shared or delegated to the MSP/CSP when the client uses one. When a requirement is Shared or delegated, the last column must state exactly what the client still has to confirm.

## Requirements
${familyControls.map((c) => `${c.id} [${c.weight}pt]: ${c.description}`).join("\n")}`,
      3072
    );
  });

  const content = [
    `# Customer Responsibility Matrix — ${ctx.companyName}`,
    `*CMMC Level ${ctx.level} · NIST SP 800-171 Rev 2 · Generated draft — requires assessor review*`,
    "",
    intro,
    ...sections,
  ].join("\n\n");
  return { content, coversControls: ctx.controls.map((c) => c.id) };
}

/**
 * Upsert a generated artifact as the single current draft for its
 * (assessment, type, control) key, bumping the version on regeneration.
 * Returns the artifact id.
 */
export async function persistArtifact(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  args: {
    assessmentId: string;
    artifactType: ArtifactType;
    controlId: string | null;
    title: string;
    generatedBy: string;
    result: GeneratedArtifact;
  }
): Promise<string> {
  const now = new Date().toISOString();
  let query = svc
    .from("generated_artifacts")
    .select("id, version")
    .eq("assessment_id", args.assessmentId)
    .eq("artifact_type", args.artifactType)
    .eq("status", "draft");
  query = args.controlId ? query.eq("control_id", args.controlId) : query.is("control_id", null);
  const { data: existing } = await query.maybeSingle();

  if (existing) {
    await svc
      .from("generated_artifacts")
      .update({
        content: args.result.content,
        title: args.title,
        covers_controls: args.result.coversControls,
        version: (existing.version ?? 1) + 1,
        generated_by: args.generatedBy,
        generated_at: now,
        updated_at: now,
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: inserted, error } = await svc
    .from("generated_artifacts")
    .insert({
      assessment_id: args.assessmentId,
      artifact_type: args.artifactType,
      control_id: args.controlId,
      title: args.title,
      content: args.result.content,
      covers_controls: args.result.coversControls,
      status: "draft",
      version: 1,
      generated_by: args.generatedBy,
      generated_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Insert failed");
  return inserted.id;
}
