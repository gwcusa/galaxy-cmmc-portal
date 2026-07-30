import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrAssessor } from "@/lib/auth-helpers";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";

// GET /api/admin/determinations?assessmentId=xxx
export async function GET(req: NextRequest) {
  const auth = await requireAdminOrAssessor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc: serviceSupabase } = auth;

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data, error } = await serviceSupabase
    .from("assessor_determinations")
    .select("control_id, ai_verdict, ai_feedback, assessor_verdict, assessor_notes, objective_verdicts, reviewed_at, updated_at")
    .eq("assessment_id", assessmentId)
    .order("reviewed_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ determinations: data ?? [] });
}

// POST /api/admin/determinations
// Upserts a single assessor determination for a control.
export async function POST(req: NextRequest) {
  const auth = await requireAdminOrAssessor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, svc: serviceSupabase, role: actorRole } = auth;

  const { assessmentId, controlId, assessorVerdict, assessorNotes, objectiveVerdicts } = await req.json();

  if (!assessmentId || !controlId || !assessorVerdict) {
    return NextResponse.json({ error: "assessmentId, controlId, assessorVerdict required" }, { status: 400 });
  }
  if (!["met", "partially_met", "not_met", "needs_review"].includes(assessorVerdict)) {
    return NextResponse.json({ error: "Invalid verdict value" }, { status: 400 });
  }
  // objectiveVerdicts (optional): { "<objectiveId>": "met" | "not_met" | "unclear" }
  let objVerdicts: Record<string, string> | null = null;
  if (objectiveVerdicts && typeof objectiveVerdicts === "object") {
    const valid = ["met", "not_met", "unclear"];
    objVerdicts = Object.fromEntries(
      Object.entries(objectiveVerdicts as Record<string, unknown>).filter(
        ([, v]) => typeof v === "string" && valid.includes(v)
      )
    ) as Record<string, string>;
    if (Object.keys(objVerdicts).length === 0) objVerdicts = null;
  }

  // Snapshot current AI recommendation for audit trail
  const { data: aiData } = await serviceSupabase
    .from("control_ai_feedback")
    .select("verdict, feedback")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .single();

  const now = new Date().toISOString();

  const { error } = await serviceSupabase
    .from("assessor_determinations")
    .upsert(
      {
        assessment_id: assessmentId,
        control_id: controlId,
        ai_verdict: aiData?.verdict ?? null,
        ai_feedback: aiData?.feedback ?? null,
        assessor_verdict: assessorVerdict,
        assessor_notes: assessorNotes ?? null,
        objective_verdicts: objVerdicts,
        reviewed_by: user.id,
        reviewed_at: now,
        updated_at: now,
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole,
    action: "determination.recorded",
    entityType: "assessment",
    entityId: assessmentId,
    metadata: { controlId, assessorVerdict, aiVerdict: aiData?.verdict ?? null },
  });

  return NextResponse.json({ success: true, reviewedAt: now });
}
