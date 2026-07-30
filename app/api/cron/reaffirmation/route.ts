import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReaffirmationReminderEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

export const maxDuration = 60;

// Remind clients ~11 months after finalization (annual affirmation cycle).
const REMIND_AFTER_DAYS = 335;

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

  return NextResponse.json({ success: true, reminded: sent, considered: due?.length ?? 0 });
}
