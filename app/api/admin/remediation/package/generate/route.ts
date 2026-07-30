import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { logAudit } from "@/lib/audit";
import {
  ARTIFACT_TITLES,
  buildContext,
  generateSSP,
  generatePOAM,
  generatePolicies,
  generateResponsibilityMatrix,
  persistArtifact,
  ArtifactType,
  EngagementContext,
  GeneratedArtifact,
} from "@/lib/remediation-artifacts";

export const maxDuration = 300;

// POST /api/admin/remediation/package/generate { assessmentId }
// One-click: draft the full engagement-level remediation package (SSP, POA&M,
// policy templates, and the Customer Responsibility Matrix) in a single call.
// Per-control configuration baselines stay on-demand to keep this bounded.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId } = (await req.json()) as { assessmentId?: string };
  if (!assessmentId) return NextResponse.json({ error: "assessmentId required" }, { status: 400 });

  const { data: assessment } = await svc
    .from("assessments")
    .select("id, client_id")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  const { data: client } = await svc
    .from("clients")
    .select("company_name, cmmc_target_level, engagement_type")
    .eq("id", assessment.client_id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (client.engagement_type !== "remediation") {
    return NextResponse.json({ error: "Only available for Remediation Package clients" }, { status: 400 });
  }

  const ctx = await buildContext(
    svc,
    assessmentId,
    assessment.client_id,
    client.company_name,
    ((client.cmmc_target_level as 1 | 2) ?? 2)
  );

  const jobs: { type: ArtifactType; run: (c: EngagementContext) => Promise<GeneratedArtifact> }[] = [
    { type: "ssp", run: generateSSP },
    { type: "poam", run: generatePOAM },
    { type: "policy_template", run: generatePolicies },
    { type: "responsibility_matrix", run: generateResponsibilityMatrix },
  ];

  // Each generator already fans out internally with bounded concurrency; run the
  // four top-level jobs together and tolerate a single failure.
  const settled = await Promise.allSettled(
    jobs.map(async (job) => {
      const result = await job.run(ctx);
      const artifactId = await persistArtifact(svc, {
        assessmentId,
        artifactType: job.type,
        controlId: null,
        title: ARTIFACT_TITLES[job.type],
        generatedBy: user.id,
        result,
      });
      return { type: job.type, artifactId };
    })
  );

  const generated = settled.flatMap((s, i) =>
    s.status === "fulfilled" ? [s.value] : (console.error(`Package job ${jobs[i].type} failed:`, s.reason), [])
  );
  const failed = jobs.filter((j) => !generated.some((g) => g.type === j.type)).map((j) => j.type);

  if (generated.length === 0) {
    return NextResponse.json({ error: "Package generation failed — try again" }, { status: 500 });
  }

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "artifact.package_generated",
    entityType: "assessment",
    entityId: assessmentId,
    metadata: { generated: generated.map((g) => g.type), failed },
  });

  return NextResponse.json({ success: true, generated, failed });
}
