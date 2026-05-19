import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendInfoRequestResponseEmail } from "@/lib/email";

// POST /api/info-requests/[id]/respond — client responds to an information request
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  // Find client
  const { data: client } = await svc
    .from("clients")
    .select("id")
    .eq("user_id", session.user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Verify this request belongs to the client's assessment
  const { data: infoReq } = await svc
    .from("information_requests")
    .select("id, assessment_id, status, subject")
    .eq("id", params.id)
    .single();

  if (!infoReq) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (infoReq.status !== "pending") return NextResponse.json({ error: "Request is not pending" }, { status: 400 });

  const { data: assessment } = await svc
    .from("assessments")
    .select("client_id")
    .eq("id", infoReq.assessment_id)
    .single();

  if (assessment?.client_id !== client.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { response } = await req.json();
  if (!response?.trim()) {
    return NextResponse.json({ error: "response text is required" }, { status: 400 });
  }

  const { error } = await svc
    .from("information_requests")
    .update({
      status: "responded",
      client_response: response.trim(),
      responded_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify assessor — fire and forget
  const { data: clientRecord } = await svc
    .from("clients")
    .select("id, contact_name, company_name")
    .eq("id", client.id)
    .single();

  if (clientRecord) {
    sendInfoRequestResponseEmail({
      companyName: clientRecord.company_name,
      contactName: clientRecord.contact_name,
      clientId: clientRecord.id,
      subject: infoReq.subject,
      response: response.trim(),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
