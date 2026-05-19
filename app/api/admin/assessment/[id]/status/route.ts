import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendStatusChangeEmail } from "@/lib/email";

// Valid assessor-driven status transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  submitted:             ["under_review", "archived"],
  under_review:          ["approved", "remediation_required", "archived"],
  remediation_required:  ["under_review", "archived"],
  resubmitted:           ["under_review", "archived"],
  approved:              ["finalized", "under_review", "archived"],
  finalized:             ["archived"],
};

// POST /api/admin/assessment/[id]/status
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceSupabase = createServiceSupabaseClient();

  // Verify assessor role
  const { data: role } = await serviceSupabase
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id)
    .single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status: newStatus } = await req.json();
  if (!newStatus) return NextResponse.json({ error: "status required" }, { status: 400 });

  const assessmentId = params.id;

  // Fetch current status
  const { data: assessment } = await serviceSupabase
    .from("assessments")
    .select("id, status")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const allowed = ALLOWED_TRANSITIONS[assessment.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${assessment.status}' to '${newStatus}'` },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "finalized") updates.completed_at = new Date().toISOString();

  const { error } = await serviceSupabase
    .from("assessments")
    .update(updates)
    .eq("id", assessmentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify client of status change — fire and forget
  const { data: clientRecord } = await serviceSupabase
    .from("assessments")
    .select("clients(contact_name, company_name, user_id)")
    .eq("id", assessmentId)
    .single();

  type ClientRow = { contact_name: string; company_name: string; user_id: string };
  const raw = (clientRecord as unknown as { clients: ClientRow | ClientRow[] } | null)?.clients;
  const clientData: ClientRow | null = raw ? (Array.isArray(raw) ? raw[0] : raw) : null;

  if (clientData) {
    const { data: authUser } = await serviceSupabase.auth.admin.getUserById(clientData.user_id);
    if (authUser?.user?.email) {
      sendStatusChangeEmail({
        clientEmail: authUser.user.email,
        clientName: clientData.contact_name,
        companyName: clientData.company_name,
        newStatus,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ success: true, previousStatus: assessment.status, newStatus });
}
