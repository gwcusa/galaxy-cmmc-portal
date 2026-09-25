import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReaffirmationReminderEmail, sendLicenseExpiringEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { formatLongDate } from "@/lib/licensing";

export const maxDuration = 60;

// Remind clients ~11 months after finalization (annual affirmation cycle).
const REMIND_AFTER_DAYS = 335;

// Remind clients (and the admin) this many days before their license expires.
const LICENSE_EXPIRY_WINDOW_DAYS = 14;

// GET /api/cron/reaffirmation
// Runs daily (Vercel Cron). Emails clients whose finalized assessment is nearing
// its annual affirmation date, at most once per cycle (reaffirmation_reminded_at).
export async function GET(req: NextRequest) {
  // Vercel Cron sends: Authorization: Bearer ${CRON_SECRET}
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceSupabaseClient();
  const cutoff = new Date(Date.now() - REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: due, error } = await svc
    .from("assessments")
    .select("id, completed_at, client_id, clients(company_name, contact_name, user_id)")
    .eq("status", "finalized")
    .lte("completed_at", cutoff)
    .is("reaffirmation_reminded_at", null)
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const a of due ?? []) {
    const client = (Array.isArray(a.clients) ? a.clients[0] : a.clients) as {
      company_name: string;
      contact_name: string;
      user_id: string;
    } | null;
    if (!client) continue;

    const { data: authUser } = await svc.auth.admin.getUserById(client.user_id);
    if (authUser?.user?.email) {
      await sendReaffirmationReminderEmail({
        clientEmail: authUser.user.email,
        clientName: client.contact_name,
        companyName: client.company_name,
        finalizedOn: new Date(a.completed_at as string).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      });
    }

    await svc.from("assessments").update({ reaffirmation_reminded_at: new Date().toISOString() }).eq("id", a.id);
    logAudit({
      actorId: null,
      actorRole: "system",
      action: "reaffirmation.reminded",
      entityType: "assessment",
      entityId: a.id,
      metadata: { clientId: a.client_id },
    });
    sent++;
  }

  // ---- Job 2: license expiry reminders — once per license, 14 days out ----
  const nowIso = new Date().toISOString();
  const windowEndIso = new Date(Date.now() + LICENSE_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring, error: licenseError } = await svc
    .from("client_licenses")
    .select("id, client_id, starts_at, expires_at, clients(company_name, contact_name, user_id), packages(name)")
    .is("voided_at", null)
    .is("expiry_reminded_at", null)
    .gt("expires_at", nowIso)
    .lte("expires_at", windowEndIso)
    .limit(100);

  if (licenseError) return NextResponse.json({ error: licenseError.message }, { status: 500 });

  let licensesReminded = 0;
  for (const l of expiring ?? []) {
    // Skip rows that are no longer the client's current license (a newer
    // non-voided row exists) and stamp them so they are not reconsidered.
    const { data: newer } = await svc
      .from("client_licenses")
      .select("id")
      .eq("client_id", l.client_id)
      .is("voided_at", null)
      .gt("starts_at", l.starts_at)
      .limit(1);
    if ((newer ?? []).length > 0) {
      await svc.from("client_licenses").update({ expiry_reminded_at: nowIso }).eq("id", l.id);
      continue;
    }

    const client = (Array.isArray(l.clients) ? l.clients[0] : l.clients) as {
      company_name: string;
      contact_name: string;
      user_id: string;
    } | null;
    const pkg = (Array.isArray(l.packages) ? l.packages[0] : l.packages) as { name: string } | null;

    if (client) {
      const { data: authUser } = await svc.auth.admin.getUserById(client.user_id);
      if (authUser?.user?.email) {
        await sendLicenseExpiringEmail({
          clientEmail: authUser.user.email,
          clientName: client.contact_name,
          companyName: client.company_name,
          packageName: pkg?.name ?? "Assessment",
          expiresOn: formatLongDate(l.expires_at as string),
        });
      }
    }

    await svc.from("client_licenses").update({ expiry_reminded_at: nowIso }).eq("id", l.id);
    logAudit({
      actorId: null,
      actorRole: "system",
      action: "license.expiry_reminded",
      entityType: "license",
      entityId: l.id,
      metadata: { clientId: l.client_id, expiresAt: l.expires_at },
    });
    licensesReminded++;
  }

  return NextResponse.json({
    success: true,
    reminded: sent,
    considered: due?.length ?? 0,
    licensesReminded,
    licensesConsidered: expiring?.length ?? 0,
  });
}
