import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/remediation?assessmentId=xxx
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const service = createServiceSupabaseClient();
  const { data: notes, error } = await service
    .from("remediation_notes")
    .select("*")
    .eq("assessment_id", assessmentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notes: notes ?? [] });
}

// POST /api/remediation
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.user_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { assessmentId, controlId, customGuidance, action } = body as {
    assessmentId: string;
    controlId: string;
    customGuidance: string;
    action: "save" | "approve";
  };

  if (!assessmentId || !controlId) {
    return NextResponse.json({ error: "assessmentId and controlId are required" }, { status: 400 });
  }
  if (action !== "save" && action !== "approve") {
    return NextResponse.json({ error: "action must be 'save' or 'approve'" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const service = createServiceSupabaseClient();

  const upsertData: {
    assessment_id: string;
    control_id: string;
    custom_guidance: string;
    status: string;
    updated_at: string;
    approved_at: string | null;
  } = {
    assessment_id: assessmentId,
    control_id: controlId,
    custom_guidance: customGuidance,
    status: action === "approve" ? "approved" : "draft",
    updated_at: now,
    approved_at: action === "approve" ? now : null,
  };

  const { error } = await service
    .from("remediation_notes")
    .upsert(upsertData, { onConflict: "assessment_id,control_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, status: action === "approve" ? "approved" : "draft" });
}
