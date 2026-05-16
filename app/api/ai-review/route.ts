import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/ai-review?assessmentId=xxx&controlId=yyy
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  const controlId = req.nextUrl.searchParams.get("controlId");
  if (!assessmentId || !controlId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const { data } = await serviceClient
    .from("control_ai_feedback")
    .select("verdict, feedback, generated_at")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .single();

  if (!data) return NextResponse.json({ verdict: null });
  return NextResponse.json({ verdict: data.verdict, feedback: data.feedback, generatedAt: data.generated_at });
}

// POST /api/ai-review
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { assessmentId, controlId } = await req.json();
  if (!assessmentId || !controlId) {
    return NextResponse.json({ error: "assessmentId and controlId required" }, { status: 400 });
  }

  // Verify ownership
  const { data: client } = await serviceClient
    .from("clients")
    .select("id")
    .eq("user_id", session.user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: assessment } = await serviceClient
    .from("assessments")
    .select("id, client_id")
    .eq("id", assessmentId)
    .eq("client_id", client.id)
    .single();

  if (!assessment) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load context
  const { data: control } = await serviceClient
    .from("controls")
    .select("description, guidance")
    .eq("id", controlId)
    .single();

  if (!control) return NextResponse.json({ error: "Control not found" }, { status: 404 });

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

  // Download artifact content
  const artifactContents: Array<{ name: string; type: string; base64?: string; text?: string }> = [];

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
      // docx, xlsx — just note the filename
      artifactContents.push({ name: artifact.file_name, type: mimeType });
    }
  }

  // Build Claude message
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a CMMC Level 2 compliance expert. Your job is to review evidence provided by a defense contractor for a specific NIST SP 800-171 control and determine if it is sufficient for certification.

Be practical and specific. Your response must be a JSON object with exactly two fields:
- "verdict": one of "sufficient", "needs_more", or "insufficient"
- "feedback": 2-4 sentences explaining your assessment. Be specific about what evidence is strong, what is missing, and what the client should do next.

Verdict definitions:
- "sufficient": The evidence clearly demonstrates the control is fully implemented
- "needs_more": Evidence exists but needs additional documentation or clarification
- "insufficient": Little or no evidence provided, or evidence does not match the control requirement

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.`;

  const contentParts: Anthropic.MessageParam["content"] = [];

  contentParts.push({
    type: "text",
    text: `Control ID: ${controlId}
Control Requirement: ${control.description}
Remediation Guidance: ${control.guidance ?? "N/A"}

Client Self-Assessment: ${response?.response ?? "Not answered"}
Client Notes: ${response?.notes ?? "No notes provided"}

Uploaded Evidence Files: ${(artifacts ?? []).length === 0 ? "None" : (artifacts ?? []).map(a => a.file_name).join(", ")}`,
  });

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
        text: `\n--- Content of ${artifact.name} ---\n${artifact.text}\n---`,
      });
    }
  }

  // Call Claude
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: contentParts }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";

    let verdict: "sufficient" | "needs_more" | "insufficient" = "needs_more";
    let feedback = "Unable to analyze evidence at this time.";

    try {
      const parsed = JSON.parse(rawText);
      verdict = parsed.verdict ?? "needs_more";
      feedback = parsed.feedback ?? feedback;
    } catch {
      // If JSON parse fails, extract verdict from text
      if (rawText.toLowerCase().includes("sufficient") && !rawText.toLowerCase().includes("needs_more") && !rawText.toLowerCase().includes("insufficient")) {
        verdict = "sufficient";
      } else if (rawText.toLowerCase().includes("insufficient")) {
        verdict = "insufficient";
      }
      feedback = rawText.slice(0, 500);
    }

    // Save to DB (upsert)
    await serviceClient.from("control_ai_feedback").upsert({
      assessment_id: assessmentId,
      control_id: controlId,
      feedback,
      verdict,
      generated_at: new Date().toISOString(),
    }, { onConflict: "assessment_id,control_id" });

    return NextResponse.json({ verdict, feedback, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("AI review failed:", err);
    return NextResponse.json({ error: "AI review failed" }, { status: 500 });
  }
}
