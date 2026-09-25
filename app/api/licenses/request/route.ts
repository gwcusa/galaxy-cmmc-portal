import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendPackageRequestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST /api/licenses/request { packageId, message? }
// Open to clients in any entitlement state. Emails the admin; nothing is
// written to the ledger — the admin records the purchase after payment.
// Throttled to one request per client per hour (checked against audit_log).
const REQUEST_COOLDOWN_MS = 60 * 60 * 1000;

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

  const { data: recent } = await svc
    .from("audit_log")
    .select("created_at")
    .eq("action", "license.requested")
    .eq("entity_type", "client")
    .eq("entity_id", client.id)
    .gt("created_at", new Date(Date.now() - REQUEST_COOLDOWN_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    return NextResponse.json(
      { error: "too_many_requests", message: "You already sent a request recently. Galaxy will be in touch." },
      { status: 429 }
    );
  }

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
