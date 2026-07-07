import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { CONTROLS } from "@/lib/controls";
import objectivesData from "@/data/assessment-objectives.json";
import { formatScopingForPrompt } from "@/lib/scoping-questions";
import { sendInfoRequestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const QUESTIONS_TOOL: Anthropic.Tool = {
  name: "propose_intake_questions",
  description: "Propose simple intake questions for the client about a gap control.",
  input_schema: {
    type: "object" as const,
    properties: {
      subject: { type: "string", description: "Short subject line for the request, mentioning the control" },
      intro: {
        type: "string",
        description: "2-3 friendly sentences explaining why we're asking and what we'll do with the answers (draft their documentation).",
      },
      questions: {
        type: "array",
        description: "4-8 questions a non-technical business owner can answer",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "snake_case identifier" },
            question: { type: "string" },
            hint: { type: "string", description: "Optional example or clarification, one sentence" },
          },
          required: ["id", "question"],
        },
      },
    },
    required: ["subject", "intro", "questions"],
  },
};

// POST /api/admin/intake/generate { assessmentId, controlId }
// Generates targeted intake questions for a gap control, grounded in everything
// the client already submitted (so it never asks what we already know), and
// creates an information_request the client answers in the portal.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, controlId } = await req.json();
  const control = CONTROLS.find((c) => c.id === controlId);
  if (!assessmentId || !control) {
    return NextResponse.json({ error: "assessmentId and valid controlId required" }, { status: 400 });
  }

  const [{ data: assessment }, { data: response }, { data: aiFeedback }, { data: scoping }, { data: priorIntake }] =
    await Promise.all([
      svc.from("assessments").select("client_id, clients(user_id, company_name, contact_name)").eq("id", assessmentId).single(),
      svc.from("assessment_responses").select("response, notes").eq("assessment_id", assessmentId).eq("control_id", controlId).maybeSingle(),
      svc.from("control_ai_feedback").select("verdict, feedback").eq("assessment_id", assessmentId).eq("control_id", controlId).maybeSingle(),
      svc.from("assessment_scoping").select("answers").eq("assessment_id", assessmentId).maybeSingle(),
      svc.from("information_requests").select("control_id, questions, answers").eq("assessment_id", assessmentId).eq("request_type", "ai_intake").not("answers", "is", null),
    ]);

  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  // Documents the client already mapped to this control
  const { data: linkedDocs } = await svc
    .from("document_control_links")
    .select("documents!inner(title, file_name, client_id)")
    .eq("control_id", controlId)
    .eq("status", "confirmed");
  const docTitles = (linkedDocs ?? [])
    .map((l) => (Array.isArray(l.documents) ? l.documents[0] : l.documents))
    .filter((d) => (d as { client_id: string } | null)?.client_id === assessment.client_id)
    .map((d) => (d as { title: string | null; file_name: string }).title ?? (d as { file_name: string }).file_name);

  const objInfo = (objectivesData as Record<string, { objectives: { id: string; text: string }[] }>)[controlId];
  const priorAnswers = (priorIntake ?? [])
    .map((r) => `Control ${r.control_id}: ${JSON.stringify(r.answers).slice(0, 400)}`)
    .join("\n");

  const prompt = `You are a CMMC consultant at an RPO. The client has a gap on control ${controlId} and we may draft their missing documentation/configuration for them. Write simple intake questions to collect ONLY the facts we still need.

## Control
${controlId}: ${control.description}
Assessment objectives:
${(objInfo?.objectives ?? []).map((o) => `- ${o.text}`).join("\n")}

## What we already know (do NOT ask about any of this again)
Environment scoping profile:
${formatScopingForPrompt((scoping?.answers as Record<string, unknown>) ?? {})}

Client's self-assessment for this control: ${response?.response ?? "not answered"}
Client's notes: ${response?.notes ?? "(none)"}
Evidence review finding: ${aiFeedback ? `${aiFeedback.verdict} — ${aiFeedback.feedback}` : "(no review yet)"}
Documents already on file for this control: ${docTitles.length > 0 ? docTitles.join(", ") : "(none)"}
${priorAnswers ? `Answers already collected in other intake requests:\n${priorAnswers}` : ""}

## Rules for questions
- Plain language a small-business owner understands. No compliance jargon ("subnet" is fine; "assessment objective 3.1.1[b]" is not).
- Ask about facts: what tools they use, who is responsible, what happens today, names/versions/settings.
- Never ask a question the materials above already answer.
- 4-8 questions maximum.

Propose the questions with the propose_intake_questions tool.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: [QUESTIONS_TOOL],
    tool_choice: { type: "tool", name: "propose_intake_questions" },
    messages: [{ role: "user", content: prompt }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!toolUse) return NextResponse.json({ error: "Question generation failed" }, { status: 500 });

  const result = toolUse.input as {
    subject: string;
    intro: string;
    questions: { id: string; question: string; hint?: string }[];
  };

  if (!result.questions?.length) {
    return NextResponse.json({ error: "No questions generated" }, { status: 500 });
  }

  const { data: created, error } = await svc
    .from("information_requests")
    .insert({
      assessment_id: assessmentId,
      subject: result.subject || `Information needed: control ${controlId}`,
      body: result.intro ?? "",
      request_type: "ai_intake",
      control_id: controlId,
      questions: result.questions,
      requested_by: user.id,
    })
    .select("id, subject, questions")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "intake.questions_sent",
    entityType: "assessment",
    entityId: assessmentId,
    metadata: { controlId, questionCount: result.questions.length },
  });

  // Notify client — fire and forget
  const client = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  if (client) {
    const c = client as { user_id: string; company_name: string; contact_name: string };
    const { data: authUser } = await svc.auth.admin.getUserById(c.user_id);
    if (authUser?.user?.email) {
      sendInfoRequestEmail({
        clientEmail: authUser.user.email,
        clientName: c.contact_name,
        companyName: c.company_name,
        subject: created.subject,
        body: result.intro ?? "",
      }).catch(() => {});
    }
  }

  return NextResponse.json({ request: created });
}
