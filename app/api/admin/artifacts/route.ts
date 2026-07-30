import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

const BUCKET = "documents";

// GET /api/admin/artifacts?assessmentId=xxx — list all generated artifacts
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data, error } = await svc
    .from("generated_artifacts")
    .select("id, artifact_type, control_id, version, title, content, status, covers_controls, generated_at, updated_at")
    .eq("assessment_id", assessmentId)
    .order("generated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ artifacts: data ?? [] });
}

/**
 * When a policy bundle or SSP is published, materialize it as a mapped evidence
 * document so the next assessment automatically sees it — closing the
 * assess → remediate → re-assess loop without a manual re-upload. Idempotent:
 * re-publishing the same artifact does not create duplicate documents.
 * Config baselines (how-to guides) and the POA&M are NOT evidence, so they are
 * skipped. An SSP is evidence only for the SSP requirement (3.12.4); a policy
 * bundle is the "policy exists" evidence for the gap controls it covers.
 */
async function materializeEvidence(
  svc: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  artifactId: string
): Promise<void> {
  const { data: artifact } = await svc
    .from("generated_artifacts")
    .select("id, assessment_id, artifact_type, title, content, covers_controls")
    .eq("id", artifactId)
    .single();
  if (!artifact) return;
  if (!["policy_template", "ssp"].includes(artifact.artifact_type)) return;

  const controls =
    artifact.artifact_type === "ssp" ? ["3.12.4"] : ((artifact.covers_controls as string[] | null) ?? []);
  if (controls.length === 0) return;

  // Idempotency — never double-create for the same source artifact.
  const { data: existing } = await svc
    .from("documents")
    .select("id")
    .eq("source_artifact_id", artifactId)
    .maybeSingle();
  if (existing) return;

  const { data: assessment } = await svc
    .from("assessments")
    .select("client_id")
    .eq("id", artifact.assessment_id)
    .single();
  if (!assessment) return;

  const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await storage.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const fileName = `${artifact.title.replace(/[^a-z0-9]+/gi, "-")}.md`;
  const storagePath = `${assessment.client_id}/generated-${artifactId}.md`;
  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(storagePath, Buffer.from(artifact.content ?? "", "utf8"), { contentType: "text/markdown", upsert: true });
  if (uploadError) {
    console.error("Evidence upload failed:", uploadError.message);
    return;
  }

  const { data: doc, error: docError } = await svc
    .from("documents")
    .insert({
      client_id: assessment.client_id,
      file_name: fileName,
      title: artifact.title,
      doc_type: artifact.artifact_type === "ssp" ? "plan" : "policy",
      storage_path: storagePath,
      mime_type: "text/markdown",
      uploaded_by: userId,
      source: "generated",
      source_artifact_id: artifactId,
    })
    .select("id")
    .single();
  if (docError || !doc) {
    console.error("Evidence document insert failed:", docError?.message);
    return;
  }

  const links = controls.map((controlId) => ({
    document_id: doc.id,
    control_id: controlId,
    status: "confirmed",
    source: "assessor",
    rationale: `Auto-mapped from published deliverable "${artifact.title}". Assessor to verify sufficiency at re-assessment.`,
  }));
  await svc.from("document_control_links").upsert(links, { onConflict: "document_id,control_id" });

  logAudit({
    actorId: userId,
    actorRole: "admin",
    action: "artifact.materialized_evidence",
    entityType: "document",
    entityId: doc.id,
    metadata: { artifactId, controls },
  });
}

// PATCH /api/admin/artifacts — update content or finalize/publish
export async function PATCH(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, content, status } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (content !== undefined) updates.content = content;
  if (["finalized", "draft", "published"].includes(status)) updates.status = status;

  const { error } = await svc
    .from("generated_artifacts")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: updates.status ? `artifact.status_${updates.status}` : "artifact.edited",
    entityType: "artifact",
    entityId: id,
  });

  // Closing the loop happens on publish, after the content update is committed.
  if (updates.status === "published") {
    try {
      await materializeEvidence(svc, user.id, id);
    } catch (err) {
      console.error("materializeEvidence failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
