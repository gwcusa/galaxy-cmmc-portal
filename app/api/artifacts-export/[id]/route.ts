import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { markdownToDocx } from "@/lib/markdown-docx";

// GET /api/artifacts-export/[id] — download a generated artifact as .docx
// Admins can export any artifact; clients only published artifacts on their own assessment.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  const isAdmin = role?.role === "admin";

  const { data: artifact } = await svc
    .from("generated_artifacts")
    .select("id, title, content, status, assessment_id, assessments(clients(user_id, company_name))")
    .eq("id", params.id)
    .single();
  if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assessment = Array.isArray(artifact.assessments) ? artifact.assessments[0] : artifact.assessments;
  const client = assessment
    ? (Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients)
    : null;

  if (!isAdmin) {
    const owned = (client as { user_id: string } | null)?.user_id === user.id;
    if (!owned || artifact.status !== "published") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const buffer = await markdownToDocx(artifact.title, artifact.content);
  const safeName = artifact.title.replace(/[^a-zA-Z0-9 \-_]/g, "").replace(/\s+/g, "_");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}
