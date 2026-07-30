import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { buildSprsWorksheet } from "@/lib/sprs-worksheet";

// GET /api/admin/reports/sprs-worksheet?assessmentId=xxx
// Downloads an SPRS-submission-ready worksheet (markdown) for the assessment.
export async function GET(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data: assessment } = await svc
    .from("assessments")
    .select("id, client_id, clients(company_name, cmmc_target_level)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const client = (Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients) as {
    company_name: string;
    cmmc_target_level: number | null;
  } | null;
  const level = ((client?.cmmc_target_level as 1 | 2) ?? 2);

  const { data: responses } = await svc
    .from("assessment_responses")
    .select("control_id, response")
    .eq("assessment_id", assessmentId);
  const responseMap: ResponseMap = {};
  for (const r of responses ?? []) responseMap[r.control_id] = r.response as ResponseMap[string];

  const score = calculateScore(responseMap, level);
  const markdown = buildSprsWorksheet({
    companyName: client?.company_name ?? "Client",
    level,
    score,
    generatedAt: new Date().toISOString(),
  });

  const safeName = (client?.company_name ?? "client").replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="SPRS-Worksheet-${safeName}.md"`,
    },
  });
}
