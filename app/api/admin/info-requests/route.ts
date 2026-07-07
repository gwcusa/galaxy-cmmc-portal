import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendInfoRequestEmail } from "@/lib/email";

async function requireAdmin() {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return { error: "Forbidden", status: 403 };
  return { user, svc };
}

// GET /api/admin/info-requests?assessmentId=xxx
export async function GET(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { svc } = result;

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data, error } = await svc
    .from("information_requests")
    .select("id, subject, body, status, requested_at, client_response, responded_at, request_type, control_id, questions, answers")
    .eq("assessment_id", assessmentId)
    .order("requested_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

// POST /api/admin/info-requests — create a new request
export async function POST(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { user, svc } = result;

  const { assessmentId, subject, body } = await req.json();
  if (!assessmentId || !subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "assessmentId, subject, and body required" }, { status: 400 });
  }

  const { data, error } = await svc
    .from("information_requests")
    .insert({
      assessment_id: assessmentId,
      subject: subject.trim(),
      body: body.trim(),
      status: "pending",
      requested_by: user.id,
    })
    .select("id, subject, body, status, requested_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify client — fire and forget
  const { data: assessmentRecord } = await svc
    .from("assessments")
    .select("clients(contact_name, company_name, user_id)")
    .eq("id", assessmentId)
    .single();

  type ClientRow = { contact_name: string; company_name: string; user_id: string };
  const raw = (assessmentRecord as unknown as { clients: ClientRow | ClientRow[] } | null)?.clients;
  const clientData: ClientRow | null = raw ? (Array.isArray(raw) ? raw[0] : raw) : null;

  if (clientData) {
    const { data: authUser } = await svc.auth.admin.getUserById(clientData.user_id);
    if (authUser?.user?.email) {
      sendInfoRequestEmail({
        clientEmail: authUser.user.email,
        clientName: clientData.contact_name,
        companyName: clientData.company_name,
        subject: subject.trim(),
        body: body.trim(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ request: data });
}
