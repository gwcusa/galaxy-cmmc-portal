import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { CONTROLS, getControlsForLevel } from "@/lib/controls";
import objectivesData from "@/data/assessment-objectives.json";

const objectivesMap = objectivesData as Record<string, { objectives: { id: string; text: string }[] }>;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/admin/reports/assessment-csv?assessmentId=xxx
// Full assessment export for the assessor: every in-scope control with the
// client response, AI verdict, assessor verdict, per-objective roll-up and notes.
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
    .select("id, clients(company_name, cmmc_target_level)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const client = (Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients) as {
    company_name: string;
    cmmc_target_level: number | null;
  } | null;
  const level = ((client?.cmmc_target_level as 1 | 2) ?? 2);

  const [{ data: responses }, { data: aiFeedback }, { data: determinations }] = await Promise.all([
    svc.from("assessment_responses").select("control_id, response, notes").eq("assessment_id", assessmentId),
    svc.from("control_ai_feedback").select("control_id, verdict, objective_results").eq("assessment_id", assessmentId),
    svc.from("assessor_determinations").select("control_id, assessor_verdict, assessor_notes, objective_verdicts").eq("assessment_id", assessmentId),
  ]);

  const respMap = new Map((responses ?? []).map((r) => [r.control_id, r]));
  const aiMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f]));
  const detMap = new Map((determinations ?? []).map((d) => [d.control_id, d]));

  const headers = [
    "Control", "Domain", "Weight", "Level", "Client Response", "Client Notes",
    "AI Verdict", "Assessor Verdict", "Objectives Met (assessor)", "Assessor Notes",
  ];
  const lines = [headers.map(csvCell).join(",")];

  for (const c of getControlsForLevel(level)) {
    const full = CONTROLS.find((x) => x.id === c.id);
    const r = respMap.get(c.id);
    const ai = aiMap.get(c.id);
    const det = detMap.get(c.id);
    const objs = objectivesMap[c.id]?.objectives ?? [];
    const objVerdicts = (det?.objective_verdicts ?? {}) as Record<string, string>;
    const metCount = objs.filter((o) => objVerdicts[o.id] === "met").length;
    const objSummary = objs.length ? `${metCount}/${objs.length}` : "";

    lines.push([
      c.id,
      full?.domain ?? c.domain_code,
      c.weight,
      c.level,
      r?.response ?? "not answered",
      r?.notes ?? "",
      ai?.verdict ?? "",
      det?.assessor_verdict ?? "",
      objSummary,
      det?.assessor_notes ?? "",
    ].map(csvCell).join(","));
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM for Excel
  const safeName = (client?.company_name ?? "client").replace(/[^a-z0-9]+/gi, "-");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Assessment-${safeName}.csv"`,
    },
  });
}
