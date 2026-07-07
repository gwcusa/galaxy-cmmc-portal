import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { runAiReview } from "@/lib/run-ai-review";

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/ai-review?assessmentId=xxx&controlId=yyy
// Used by admins to read cached AI feedback
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assessmentId = req.nextUrl.searchParams.get("assessmentId");
  const controlId = req.nextUrl.searchParams.get("controlId");
  if (!assessmentId || !controlId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const { data } = await serviceClient
    .from("control_ai_feedback")
    .select("verdict, feedback, objective_results, generated_at")
    .eq("assessment_id", assessmentId)
    .eq("control_id", controlId)
    .single();

  if (!data) return NextResponse.json({ verdict: null });
  return NextResponse.json({
    verdict: data.verdict,
    feedback: data.feedback,
    objectiveResults: data.objective_results ?? null,
    generatedAt: data.generated_at,
  });
}

// POST /api/ai-review
// Admin-only: manually re-trigger AI review for a specific control
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Restrict to admins only
  const { data: adminCheck } = await serviceClient
    .from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .single();

  if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, controlId } = await req.json();
  if (!assessmentId || !controlId) {
    return NextResponse.json({ error: "assessmentId and controlId required" }, { status: 400 });
  }

  try {
    const result = await runAiReview(assessmentId, controlId);
    return NextResponse.json({ ...result, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("AI review failed:", err);
    return NextResponse.json({ error: "AI review failed" }, { status: 500 });
  }
}
