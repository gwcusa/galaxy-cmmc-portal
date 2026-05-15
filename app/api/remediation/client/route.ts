import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// GET /api/remediation/client?assessmentId=xxx
// Client-facing read of approved remediation notes only.
// No admin check — RLS enforces that clients only see approved notes for their own assessments.
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  // Verify this assessment belongs to the logged-in user's client record
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", session.user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 403 });

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", assessmentId)
    .eq("client_id", client.id)
    .single();

  if (!assessment) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch approved notes (RLS will also enforce this, but we add the filter explicitly)
  const { data: notes, error } = await supabase
    .from("remediation_notes")
    .select("control_id, custom_guidance")
    .eq("assessment_id", assessmentId)
    .eq("status", "approved");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notes: notes ?? [] });
}
