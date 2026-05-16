import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpg",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9.\-]/g, "");
}

async function getClientIdForAssessment(
  supabase: ReturnType<typeof createServiceSupabaseClient>,
  assessmentId: string,
  userId: string
): Promise<string | null> {
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, client_id, clients(id, user_id)")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return null;
  const client = Array.isArray(assessment.clients)
    ? assessment.clients[0]
    : assessment.clients;
  if (!client || client.user_id !== userId) return null;
  return assessment.client_id as string;
}

// GET /api/artifacts?assessmentId=xxx&controlId=yyy
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  const controlId = req.nextUrl.searchParams.get("controlId");
  if (!assessmentId || !controlId) {
    return NextResponse.json({ error: "assessmentId and controlId required" }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const clientId = await getClientIdForAssessment(serviceSupabase, assessmentId, session.user.id);
  if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: artifactRows, error } = await serviceSupabase
    .from("artifacts")
    .select("id, file_name, file_size, mime_type, storage_path, uploaded_at")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .order("uploaded_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storageClient = getStorageClient();
  const artifacts = await Promise.all(
    (artifactRows ?? []).map(async (a) => {
      const { data: signed } = await storageClient.storage
        .from("artifacts")
        .createSignedUrl(a.storage_path, 3600);
      return {
        id: a.id,
        file_name: a.file_name,
        file_size: a.file_size,
        mime_type: a.mime_type,
        uploaded_at: a.uploaded_at,
        signedUrl: signed?.signedUrl ?? "",
      };
    })
  );

  return NextResponse.json({ artifacts });
}

// POST /api/artifacts — multipart form upload
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const assessmentId = formData.get("assessmentId") as string | null;
  const controlId = formData.get("controlId") as string | null;
  const file = formData.get("file") as File | null;

  if (!assessmentId || !controlId) {
    return NextResponse.json({ error: "assessmentId and controlId required" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 });
  }

  // Validate type by extension and mime
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  const mimeOk = ALLOWED_TYPES.includes(file.type) || ALLOWED_TYPES.includes("image/jpg");
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (!extOk) {
    return NextResponse.json({ error: "File type not allowed. Accepted: PDF, PNG, JPG, DOCX, XLSX, TXT" }, { status: 400 });
  }

  const serviceSupabase = createServiceSupabaseClient();
  const clientId = await getClientIdForAssessment(serviceSupabase, assessmentId, session.user.id);
  if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Ensure bucket exists
  const storageClient = getStorageClient();
  await storageClient.storage.createBucket("artifacts", { public: false });

  // Build storage path
  const sanitized = sanitizeFilename(file.name);
  const timestamp = Date.now();
  const storagePath = `${clientId}/${assessmentId}/${controlId}/${timestamp}-${sanitized}`;

  // Upload file
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await storageClient.storage
    .from("artifacts")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Insert DB record
  const { data: artifact, error: dbError } = await serviceSupabase
    .from("artifacts")
    .insert({
      assessment_id: assessmentId,
      control_id: controlId,
      file_name: file.name,
      storage_path: storagePath,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: session.user.id,
      uploaded_at: new Date().toISOString(),
    })
    .select("id, file_name, file_size, mime_type, uploaded_at")
    .single();

  if (dbError) {
    // Cleanup uploaded file
    await storageClient.storage.from("artifacts").remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Generate signed URL for immediate display
  const { data: signed } = await storageClient.storage
    .from("artifacts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    artifact: {
      id: artifact.id,
      file_name: artifact.file_name,
      file_size: artifact.file_size,
      mime_type: artifact.mime_type,
      uploaded_at: artifact.uploaded_at,
      signedUrl: signed?.signedUrl ?? "",
    },
  });
}

// DELETE /api/artifacts?artifactId=xxx
export async function DELETE(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artifactId = req.nextUrl.searchParams.get("artifactId");
  if (!artifactId) return NextResponse.json({ error: "artifactId required" }, { status: 400 });

  const serviceSupabase = createServiceSupabaseClient();

  // Fetch artifact with assessment → client chain
  const { data: artifact } = await serviceSupabase
    .from("artifacts")
    .select("id, storage_path, assessment_id, assessments(client_id, clients(user_id))")
    .eq("id", artifactId)
    .single();

  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  // Verify ownership
  const assessment = Array.isArray(artifact.assessments)
    ? artifact.assessments[0]
    : artifact.assessments;
  const client = assessment
    ? Array.isArray(assessment.clients)
      ? assessment.clients[0]
      : assessment.clients
    : null;

  if (!client || client.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Delete from storage
  const storageClient = getStorageClient();
  await storageClient.storage.from("artifacts").remove([artifact.storage_path]);

  // Delete DB record
  const { error: dbError } = await serviceSupabase
    .from("artifacts")
    .delete()
    .eq("id", artifactId);

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
