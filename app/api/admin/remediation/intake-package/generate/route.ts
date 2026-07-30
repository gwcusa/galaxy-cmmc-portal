import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { getControlsForLevel } from "@/lib/controls";
import objectivesData from "@/data/assessment-objectives.json";
import { formatScopingForPrompt } from "@/lib/scoping-questions";
import { sendInfoRequestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const objectivesMap = objectivesData as Record<string, { objectives: { id: string; text: string }[] }>;

const PACKAGE_TOOL: Anthropic.Tool = {
  name: "propose_intake_package",
  description: "Propose one consolidated, de-duplicated intake questionnaire covering every open gap.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "Short subject line for the whole request" },
      intro: { type: "string", description: "2-3 friendly sentences: why we're asking and that answers will draft their documentation." },
      questions: {
        type: "array",
        description: "8-20 plain-language questions, de-duplicated across all gaps. Group related facts into one question.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "snake_case identifier" },
            question: { type: "string" },
            hint: { type: "string", description: "Optional one-sentence example/clarification" },
            controls: {
              type: "array",
              items: { type: "string" },
              description: "The control ids this answer helps remediate (e.g., ['3.5.3','3.5.1'])",
            },
          },
          required: ["id", "question", "controls"],
        },
      },
    },
    required: ["subject", "intro", "questions"],
  },
};

// POST /api/admin/remediation/intake-package/generate { assessmentId }
// Generates ONE consolidated intake questionnaire covering every gap control,
// de-duplicated so a fact asked once (e.g. "which MFA tool?") serves every
// control it touches. Grounded in everything already known.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId } = (await req.json()) as { assessmentId?: string };
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data: assessment } = await svc
    .from("assessments")
    .select("client_id, clients(user_id, company_name, contact_name, cmmc_target_level)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const clientRec = (Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients) as {
    user_id: string;
    company_name: string;
    contact_name: string;
    cmmc_target_level: number | null;
  } | null;
  const level = ((clientRec?.cmmc_target_level as 1 | 2) ?? 2);

  const [{ data: responses }, { data: aiFeedback }, { data: scoping }, { data: priorPackage }] = await Promise.all([
    svc.from("assessment_responses").select("control_id, response, notes").eq("assessment_id", assessmentId),
    svc.from("control_ai_feedback").select("control_id, verdict").eq("assessment_id", assessmentId),
    svc.from("assessment_scoping").select("answers").eq("assessment_id", assessmentId).maybeSingle(),
    svc.from("information_requests").select("questions, answers").eq("assessment_id", assessmentId).eq("request_type", "ai_intake_package").not("answers", "is", null),
  ]);

  const responseMap = new Map((responses ?? []).map((r) => [r.control_id, r]));
  const verdictMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f.verdict]));

  const gaps = getControlsForLevel(level).filter((c) => {
    const resp = responseMap.get(c.id)?.response;
    const verdict = verdictMap.get(c.id);
    return resp === "no" || resp === "partial" || ["not_met", "partially_met", "needs_review"].includes(verdict ?? "");
  });

  if (gaps.length === 0) {
    return NextResponse.json({ error: "No open gaps — nothing to ask about" }, { status: 400 });
  }

  const priorAnswers = (priorPackage ?? [])
    .flatMap((p) => {
      const qs = (p.questions ?? []) as { id: string; question: string }[];
      const ans = (p.answers ?? {}) as Record<string, string>;
      return qs.filter((q) => ans[q.id]).map((q) => `Q: ${q.question}\nA: ${ans[q.id]}`);
    })
    .join("\n");

  const gapBlock = gaps
    .map((c) => {
      const objs = (objectivesMap[c.id]?.objectives ?? []).map((o) => o.text).join(" ");
      const notes = responseMap.get(c.id)?.notes;
      return `- ${c.id}: ${c.description}${objs ? `\n    Objectives: ${objs.slice(0, 300)}` : ""}${notes ? `\n    Client already said: ${notes.slice(0, 200)}` : ""}`;
    })
    .join("\n");

  const prompt = `You are a CMMC consultant at an RPO. ${clientRec?.company_name ?? "The client"} has purchased a remediation package. We will draft their missing documentation and configuration. Write ONE consolidated intake questionnaire that collects every fact we still need to draft those documents across ALL the gaps below — asked as few times as possible.

## What we already know (do NOT ask about any of this again)
Environment scoping profile:
${formatScopingForPrompt((scoping?.answers as Record<string, unknown>) ?? {})}
${priorAnswers ? `\nAnswers already collected:\n${priorAnswers}` : ""}

## Open gaps to remediate (${gaps.length})
${gapBlock}

## Rules
- De-duplicate ruthlessly: many gaps share the same underlying fact (one MFA tool answers several IA controls; one "who is responsible for X" answers many). Ask each fact ONCE and tag it with every control id it informs.
- Plain language a small-business owner understands. Ask about facts (tools, versions, settings, who is responsible, what happens today) — never compliance jargon or objective ids.
- Never ask something the scoping profile or prior answers already tell us.
- 8-20 questions total. Every question must list the control ids it informs.

Propose the questionnaire with the propose_intake_package tool.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [PACKAGE_TOOL],
    tool_choice: { type: "tool", name: "propose_intake_package" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!toolUse) return NextResponse.json({ error: "Question generation failed" }, { status: 500 });
  const result = toolUse.input as {
    subject: string;
    intro: string;
    questions: { id: string; question: string; hint?: string; controls: string[] }[];
  };
  if (!result.questions?.length) return NextResponse.json({ error: "No questions generated" }, { status: 500 });

  const { data: created, error } = await svc
    .from("information_requests")
    .insert({
      assessment_id: assessmentId,
      subject: result.subject || "Remediation package — information needed",
      body: result.intro ?? "",
      request_type: "ai_intake_package",
      control_id: null,
      questions: result.questions,
      requested_by: user.id,
    })
    .select("id, subject, questions")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "intake.package_sent",
    entityType: "assessment",
    entityId: assessmentId,
    metadata: { questionCount: result.questions.length, gapCount: gaps.length },
  });

  if (clientRec) {
    const { data: authUser } = await svc.auth.admin.getUserById(clientRec.user_id);
    if (authUser?.user?.email) {
      sendInfoRequestEmail({
        clientEmail: authUser.user.email,
        clientName: clientRec.contact_name,
        companyName: clientRec.company_name,
        subject: created.subject,
        body: result.intro ?? "",
      }).catch(() => {});
    }
  }

  return NextResponse.json({ request: created, gapCount: gaps.length });
}
