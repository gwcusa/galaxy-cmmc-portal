import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { validateUpload, sanitizeFilename } from "@/lib/uploads";
import { logAudit } from "@/lib/audit";

const BUCKET = "documents";

function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function resolveClient(userId: string) {
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userId).single();
  return { svc, isAdmin: role?.role === "admin" };
}

async function getOwnedClientId(svc: ReturnType<typeof createServiceSupabaseClient>, userId: string) {
  const { data: client } = await svc.from("clients").select("id").eq("user_id", userId).single();
  return client?.id ?? null;
}

// GET /api/documents?clientId=xxx — list documents with their control links
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { svc, isAdmin } = await resolveClient(user.id);

  let clientId = req.nextUrl.searchParams.get("clientId");
  if (!isAdmin) {
    clientId = await getOwnedClientId(svc, user.id);
    if (!clientId) return NextResponse.json({ error: "No client record" }, { status: 403 });
  }
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  const { data: docs, error } = await svc
    .from("documents")
    .select("id, file_name, title, doc_type, file_size, mime_type, uploaded_at, storage_path, document_control_links(id, control_id, status, source, confidence, rationale)")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storage = getStorageClient();
  const documents = await Promise.all(
    (docs ?? []).map(async ({ storage_path, ...d }) => {
      const { data: signed } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(storage_path, 3600);
      return { ...d, signedUrl: signed?.signedUrl ?? "" };
    })
  );

  return NextResponse.json({ documents });
}

// POST /api/documents — multipart upload (client uploads to own library)
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const title = (formData.get("title") as string | null)?.trim() || null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const validationError = validateUpload(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { svc, isAdmin } = await resolveClient(user.id);
  let clientId = formData.get("clientId") as string | null;
  if (!isAdmin) {
    clientId = await getOwnedClientId(svc, user.id);
  }
  if (!clientId) return NextResponse.json({ error: "No client record" }, { status: 403 });

  const storage = getStorageClient();
  await storage.storage.createBucket(BUCKET, { public: false }).catch(() => {});

  const storagePath = `${clientId}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: doc, error: dbError } = await svc
    .from("documents")
    .insert({
      client_id: clientId,
      file_name: file.name,
      title,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: user.id,
    })
    .select("id, file_name, title, doc_type, file_size, mime_type, uploaded_at")
    .single();

  if (dbError) {
    await storage.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  logAudit({
    actorId: user.id,
    actorRole: isAdmin ? "admin" : "client",
    action: "document.uploaded",
    entityType: "document",
    entityId: doc.id,
    metadata: { clientId, fileName: file.name, fileSize: file.size },
  });

  return NextResponse.json({ document: doc });
}

// DELETE /api/documents?documentId=xxx
export async function DELETE(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const { svc, isAdmin } = await resolveClient(user.id);
  const { data: doc } = await svc
    .from("documents")
    .select("id, storage_path, client_id, clients(user_id)")
    .eq("id", documentId)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = Array.isArray(doc.clients) ? doc.clients[0] : doc.clients;
  if (!isAdmin && (owner as { user_id: string } | null)?.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storage = getStorageClient();
  await storage.storage.from(BUCKET).remove([doc.storage_path]);
  const { error } = await svc.from("documents").delete().eq("id", documentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: isAdmin ? "admin" : "client",
    action: "document.deleted",
    entityType: "document",
    entityId: documentId,
    metadata: { clientId: doc.client_id },
  });

  return NextResponse.json({ success: true });
}
