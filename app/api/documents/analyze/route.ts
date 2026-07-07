import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { extractContent } from "@/lib/extract-text";
import { CONTROLS } from "@/lib/controls";

const BUCKET = "documents";

const MAPPING_TOOL: Anthropic.Tool = {
  name: "report_document_mapping",
  description: "Report which NIST SP 800-171 controls this document provides evidence for.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Short human-readable title for the document" },
      doc_type: {
        type: "string",
        enum: ["policy", "procedure", "plan", "diagram", "config", "log", "report", "other"],
      },
      summary: { type: "string", description: "1-2 sentence summary of what the document contains" },
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            control_id: { type: "string", description: "NIST SP 800-171 requirement ID, e.g. 3.1.1" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            rationale: { type: "string", description: "One sentence: what in the document supports this control" },
          },
          required: ["control_id", "confidence", "rationale"],
        },
      },
    },
    required: ["title", "doc_type", "summary", "mappings"],
  },
};

// POST /api/documents/analyze { documentId }
// Reads the document and suggests control mappings (status 'suggested').
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await req.json();
  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  const isAdmin = role?.role === "admin";

  const { data: doc } = await svc
    .from("documents")
    .select("id, file_name, mime_type, storage_path, client_id, clients(user_id)")
    .eq("id", documentId)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = Array.isArray(doc.clients) ? doc.clients[0] : doc.clients;
  if (!isAdmin && (owner as { user_id: string } | null)?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: blob } = await storage.storage.from(BUCKET).download(doc.storage_path);
  if (!blob) return NextResponse.json({ error: "Could not read document from storage" }, { status: 500 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const extracted = await extractContent(buffer, doc.mime_type, doc.file_name);
  if (extracted.kind === "unsupported") {
    return NextResponse.json({ error: "Document format cannot be analyzed" }, { status: 400 });
  }

  const controlCatalog = CONTROLS.map((c) => `${c.id} (${c.domain_code}): ${c.description}`).join("\n");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `You are a CMMC/NIST SP 800-171 compliance specialist. A defense contractor uploaded the document "${doc.file_name}" to their compliance evidence library. Review it and identify which of the 110 NIST SP 800-171 Rev 2 requirements it provides meaningful evidence for.

Rules:
- Only map controls the document MATERIALLY supports (a policy statement, a configuration, a record). Do not map controls that are merely mentioned in passing.
- Use "high" confidence only when the document alone could satisfy an assessor for that control's documentation expectations.
- Typically a focused document maps to 3-15 controls. A comprehensive SSP may map to more.

## The 110 requirements
${controlCatalog}

## Document content follows`,
    },
  ];

  if (extracted.kind === "text") {
    content.push({ type: "text", text: extracted.text });
  } else if (extracted.kind === "image") {
    content.push({ type: "image", source: { type: "base64", media_type: extracted.mediaType, data: extracted.base64 } });
  } else if (extracted.kind === "pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: extracted.base64 } });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    tools: [MAPPING_TOOL],
    tool_choice: { type: "tool", name: "report_document_mapping" },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use") as Anthropic.ToolUseBlock | undefined;
  if (!toolUse) return NextResponse.json({ error: "Analysis produced no result" }, { status: 500 });

  const result = toolUse.input as {
    title: string;
    doc_type: string;
    summary: string;
    mappings: { control_id: string; confidence: string; rationale: string }[];
  };

  const validIds = new Set(CONTROLS.map((c) => c.id));
  const mappings = (result.mappings ?? []).filter((m) => validIds.has(m.control_id));

  // Fill in title/doc_type if the client didn't set them
  await svc
    .from("documents")
    .update({ title: result.title, doc_type: result.doc_type })
    .eq("id", documentId)
    .is("title", null);

  // Upsert suggestions; never overwrite a link the client already confirmed/rejected
  const { data: existing } = await svc
    .from("document_control_links")
    .select("control_id, status")
    .eq("document_id", documentId);
  const existingMap = new Map((existing ?? []).map((l) => [l.control_id, l.status]));

  const rows = mappings
    .filter((m) => !existingMap.has(m.control_id))
    .map((m) => ({
      document_id: documentId,
      control_id: m.control_id,
      status: "suggested",
      source: "ai",
      confidence: m.confidence === "high" ? 0.9 : m.confidence === "medium" ? 0.6 : 0.3,
      rationale: m.rationale,
    }));

  if (rows.length > 0) {
    const { error } = await svc.from("document_control_links").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    summary: result.summary,
    title: result.title,
    doc_type: result.doc_type,
    suggested: rows.length,
    skippedExisting: mappings.length - rows.length,
  });
}
