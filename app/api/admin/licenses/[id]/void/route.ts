import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

// POST /api/admin/licenses/[id]/void { reason }
// The ledger is append-only: voiding sets voided_at / void_reason and nothing
// else. Any cycle the license opened is left as is.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, svc } = auth;

  const { reason } = await req.json();
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanReason) return NextResponse.json({ error: "reason required" }, { status: 400 });

  const { data: license } = await svc
    .from("client_licenses")
    .select("id, client_id, voided_at")
    .eq("id", params.id)
    .single();
  if (!license) return NextResponse.json({ error: "License not found" }, { status: 404 });
  if (license.voided_at) return NextResponse.json({ error: "License is already voided" }, { status: 400 });

  const voidedAt = new Date().toISOString();
  const { error } = await svc
    .from("client_licenses")
    .update({ voided_at: voidedAt, void_reason: cleanReason })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "license.voided",
    entityType: "license",
    entityId: params.id,
    metadata: { clientId: license.client_id, reason: cleanReason, voidedAt },
  });

  return NextResponse.json({ success: true, voidedAt });
}
