import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { getEntitlement } from "@/lib/licensing";
import { startReassessmentCycle } from "@/lib/reassessment";

// POST /api/assessment/start-cycle
// A client with an active Unlimited license starts their own next cycle once
// the current one is finalized. Previous answers carry forward. Single and
// Additional clients cannot start cycles; the admin's assignment opens them.
export async function POST(_req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  const { data: client } = await svc
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entitlement = await getEntitlement(svc, client.id);
  if (entitlement.status !== "active") return NextResponse.json({ error: "license_inactive" }, { status: 403 });
  if (entitlement.type !== "unlimited") return NextResponse.json({ error: "unlimited_required" }, { status: 403 });

  const { data: latest } = await svc
    .from("assessments")
    .select("id, status")
    .eq("client_id", client.id)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (!latest || latest.status !== "finalized") {
    return NextResponse.json({ error: "The current assessment cycle is not finalized" }, { status: 400 });
  }

  const result = await startReassessmentCycle({
    svc,
    clientId: client.id,
    previousAssessmentId: latest.id,
    actorUserId: user.id,
    actorRole: "client",
    notifyClient: false,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ assessmentId: result.assessmentId });
}
