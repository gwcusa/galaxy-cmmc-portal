import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { CONTROLS } from "@/lib/controls";

async function authorize(documentId: string, userId: string) {
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userId).single();
  const isAdmin = role?.role === "admin";

  const { data: doc } = await svc
    .from("documents")
    .select("id, clients(user_id)")
    .eq("id", documentId)
    .single();
  if (!doc) return { svc, allowed: false, isAdmin };

  const owner = Array.isArray(doc.clients) ? doc.clients[0] : doc.clients;
  const allowed = isAdmin || (owner as { user_id: string } | null)?.user_id === userId;
  return { svc, allowed, isAdmin };
}

// POST /api/documents/links
// { documentId, controlId, action: "confirm" | "reject" }  → resolve an AI suggestion
// { documentId, controlId, action: "add" }                 → manual link (confirmed)
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId, controlId, action } = await req.json();
  if (!documentId || !controlId || !["confirm", "reject", "add"].includes(action)) {
    return NextResponse.json({ error: "documentId, controlId, and valid action required" }, { status: 400 });
  }
  if (!CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "Unknown control" }, { status: 400 });
  }

  const { svc, allowed, isAdmin } = await authorize(documentId, user.id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (action === "add") {
    const { error } = await svc.from("document_control_links").upsert(
      {
        document_id: documentId,
        control_id: controlId,
        status: "confirmed",
        source: isAdmin ? "assessor" : "client",
      },
      { onConflict: "document_id,control_id" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await svc
      .from("document_control_links")
      .update({ status: action === "confirm" ? "confirmed" : "rejected" })
      .eq("document_id", documentId)
      .eq("control_id", controlId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
