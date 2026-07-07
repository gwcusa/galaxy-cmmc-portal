import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/admin/assessment/[id]/run-status
// Latest AI review run for this assessment + whether a synthesis summary exists.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: run } = await svc
    .from("ai_review_runs")
    .select("id, status, total_controls, completed_controls, failed_controls, synthesis_done, error, started_at, finished_at")
    .eq("assessment_id", params.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ run: run ?? null });
}
