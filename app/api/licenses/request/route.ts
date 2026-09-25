import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendPackageRequestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST /api/licenses/request { packageId, message? }
// Open to clients in any entitlement state. Emails the admin; nothing is
// written to the ledger — the admin records the purchase after payment.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId, message } = await req.json();
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

  const svc = createServiceSupabaseClient();

  const { data: client } = await svc
    .from("clients")
    .select("id, company_name, contact_name")
    .eq("user_id", user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: pkg } = await svc
    .from("packages")
    .select("id, name, price_usd, is_active")
    .eq("id", packageId)
    .single();
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!pkg.is_active) return NextResponse.json({ error: "Package is not active" }, { status: 400 });

  const text = typeof message === "string" ? message.trim().slice(0, 2000) : "";

  // Notify the admin — fire and forget
  sendPackageRequestEmail({
    companyName: client.company_name,
    contactName: client.contact_name,
    clientId: client.id,
    packageName: pkg.name,
    priceUsd: Number(pkg.price_usd),
    message: text || null,
  }).catch(() => {});

  logAudit({
    actorId: user.id,
    actorRole: "client",
    action: "license.requested",
    entityType: "client",
    entityId: client.id,
    metadata: { packageId: pkg.id, packageName: pkg.name, message: text || null },
  });

  return NextResponse.json({ success: true });
}
