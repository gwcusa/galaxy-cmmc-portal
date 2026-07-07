import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";
import { CONTROLS, DOMAINS, getControlsForLevel } from "@/lib/controls";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { formatScopingForPrompt } from "@/lib/scoping-questions";
import { logAudit } from "@/lib/audit";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

type ArtifactType = "ssp" | "poam" | "policy_template" | "config_baseline";

const ARTIFACT_TITLES: Record<ArtifactType, string> = {
  ssp: "System Security Plan (SSP)",
  poam: "Plan of Action & Milestones (POA&M)",
  policy_template: "Policy & Procedure Templates",
  config_baseline: "Configuration Baseline",
};

type ControlContext = {
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

type EngagementContext = {
  companyName: string;
  level: 1 | 2;
  scopingText: string;
  documentList: string;
  controls: ControlContext[];
  score: ReturnType<typeof calculateScore>;
};

async function buildContext(
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
    svc.from("information_requests").select("control_id, questions, answers").eq("assessment_id", assessmentId).eq("request_type", "ai_intake").not("answers", "is", null),
    svc.from("documents").select("title, file_name, doc_type").eq("client_id", clientId),
  ]);

  const responseMap = new Map((responses ?? []).map((r) => [r.control_id, r]));
  const detMap = new Map((determinations ?? []).map((d) => [d.control_id, d]));
  const aiMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f]));

  // Flatten intake Q/A per control into readable text
  const intakeByControl = new Map<string, string>();
  for (const req of intake ?? []) {
    if (!req.control_id || !req.answers) continue;
    const questions = (req.questions ?? []) as { id: string; question: string }[];
    const answers = req.answers as Record<string, string>;
    const text = questions
      .filter((q) => answers[q.id])
      .map((q) => `Q: ${q.question}\nA: ${answers[q.id]}`)
      .join("\n");
    if (text) intakeByControl.set(req.control_id, text);
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
      intakeAnswers: intakeByControl.get(c.id) ?? null,
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

function controlLine(c: ControlContext): string {
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
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return message.content[0]?.type === "text" ? message.content[0].text : "";
}

async function generateSSP(ctx: EngagementContext): Promise<string> {
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

  // One call per family, bounded concurrency, shared cached system prefix
  const sections: string[] = new Array(families.length);
  let cursor = 0;
  async function worker() {
    while (cursor < families.length) {
      const i = cursor++;
      const family = families[i];
      const familyControls = ctx.controls.filter((c) => c.domainCode === family.code);
      sections[i] = await generateText(
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
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => worker()));

  return [
    `# System Security Plan — ${ctx.companyName}`,
    `*CMMC Level ${ctx.level} · NIST SP 800-171 Rev 2 · Generated draft — requires assessor review*`,
    "",
    intro,
    "## 4. Control Implementation Statements",
    ...sections,
  ].join("\n\n");
}

async function generatePOAM(ctx: EngagementContext): Promise<string> {
  const gaps = ctx.controls.filter((c) =>
    ["not_met", "partially_met", "needs_review"].includes(c.verdict) || c.response === "no"
  );
  const sprs = ctx.score.sprs;
  const body = await generateText(
    [sharedSystemBlock(ctx)],
    `Write a formal Plan of Action & Milestones (POA&M) for ${ctx.companyName}.

${sprs ? `Current SPRS score: ${sprs.scoreable ? sprs.score : "not scoreable (no SSP)"} of 110. POA&M-eligible for CMMC Conditional status: ${sprs.poamEligible ? "yes" : "no"}.` : "CMMC Level 1: all 17 practices must be MET — no POA&M is permitted for certification, so frame this as an internal remediation plan."}

## Identified gaps
${gaps.map(controlLine).join("\n\n") || "(No gaps identified)"}

## Instructions
1. Brief introduction (purpose, scope, current score).
2. One POA&M entry per gap: **Item #**, **Control** (id + description), **Weakness/Gap** (specific, from the notes/intake), **Recommended Remediation** (3-5 concrete bullet steps referencing their actual tools from the scoping profile), **Responsible Party**, **Target Completion** (30/60/90 days by complexity; put 5-point items first with shortest timelines), **Resources Required**.
3. Closing summary table: item, control, points at stake, target date.
Use markdown. Be specific and realistic.`,
    8192
  );
  return `# Plan of Action & Milestones — ${ctx.companyName}\n\n${body}`;
}

async function generatePolicies(ctx: EngagementContext): Promise<string> {
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

  const gaps = ctx.controls.filter((c) => ["not_met", "partially_met"].includes(c.verdict) || c.response === "no");
  const gapFamilies = Array.from(new Set(gaps.map((c) => c.domainCode)));
  const neededPolicies = gapFamilies.map((f) => FAMILY_TO_POLICY[f]).filter(Boolean).slice(0, 4);
  const policyList = neededPolicies.length > 0
    ? neededPolicies
    : ["Access Control Policy", "Incident Response Policy", "Configuration Management Policy"];

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
  return body;
}

async function generateConfigBaseline(ctx: EngagementContext, controlId: string): Promise<string> {
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
  return `# Configuration Baseline — ${control.id}\n*${control.description}*\n\n${body}`;
}

export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, artifactType, controlId } = (await req.json()) as {
    assessmentId: string;
    artifactType: ArtifactType;
    controlId?: string;
  };

  if (!assessmentId || !artifactType) {
    return NextResponse.json({ error: "assessmentId and artifactType required" }, { status: 400 });
  }
  if (!["ssp", "poam", "policy_template", "config_baseline"].includes(artifactType)) {
    return NextResponse.json({ error: "Invalid artifactType" }, { status: 400 });
  }
  if (artifactType === "config_baseline" && !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "config_baseline requires a valid controlId" }, { status: 400 });
  }

  const { data: assessment } = await svc
    .from("assessments")
    .select("id, client_id")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const { data: client } = await svc
    .from("clients")
    .select("company_name, cmmc_target_level, engagement_type")
    .eq("id", assessment.client_id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  if (client.engagement_type !== "remediation") {
    return NextResponse.json(
      { error: "Artifact generation is only available for Remediation Package clients" },
      { status: 400 }
    );
  }

  const ctx = await buildContext(
    svc,
    assessmentId,
    assessment.client_id,
    client.company_name,
    ((client.cmmc_target_level as 1 | 2) ?? 2)
  );

  let content: string;
  try {
    if (artifactType === "ssp") content = await generateSSP(ctx);
    else if (artifactType === "poam") content = await generatePOAM(ctx);
    else if (artifactType === "policy_template") content = await generatePolicies(ctx);
    else content = await generateConfigBaseline(ctx, controlId!);
  } catch (err) {
    console.error("Artifact generation failed:", err);
    return NextResponse.json({ error: "Generation failed — try again" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const title =
    artifactType === "config_baseline"
      ? `${ARTIFACT_TITLES.config_baseline} — ${controlId}`
      : ARTIFACT_TITLES[artifactType];

  // One draft per (assessment, type, control); regenerating bumps the version
  let query = svc
    .from("generated_artifacts")
    .select("id, version")
    .eq("assessment_id", assessmentId)
    .eq("artifact_type", artifactType)
    .eq("status", "draft");
  query = artifactType === "config_baseline" ? query.eq("control_id", controlId!) : query.is("control_id", null);
  const { data: existing } = await query.maybeSingle();

  let artifactId: string;
  if (existing) {
    await svc
      .from("generated_artifacts")
      .update({ content, title, version: (existing.version ?? 1) + 1, generated_by: user.id, generated_at: now, updated_at: now })
      .eq("id", existing.id);
    artifactId = existing.id;
  } else {
    const { data: inserted, error } = await svc
      .from("generated_artifacts")
      .insert({
        assessment_id: assessmentId,
        artifact_type: artifactType,
        control_id: artifactType === "config_baseline" ? controlId : null,
        title,
        content,
        status: "draft",
        version: 1,
        generated_by: user.id,
        generated_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    artifactId = inserted.id;
  }

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "artifact.generated",
    entityType: "artifact",
    entityId: artifactId,
    metadata: { assessmentId, artifactType, controlId: controlId ?? null },
  });

  return NextResponse.json({ success: true, artifactId, content });
}
