import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { CONTROLS } from "@/lib/controls";
import { logAudit } from "@/lib/audit";
import {
  ArtifactType,
  ARTIFACT_TITLES,
  buildContext,
  generateSSP,
  generatePOAM,
  generatePolicies,
  generateConfigBaseline,
  generateResponsibilityMatrix,
  persistArtifact,
  GeneratedArtifact,
} from "@/lib/remediation-artifacts";

export const maxDuration = 300;

const VALID_TYPES: ArtifactType[] = ["ssp", "poam", "policy_template", "config_baseline", "responsibility_matrix"];

export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, artifactType, controlId } = (await req.json()) as {
    assessmentId: string;
    artifactType: ArtifactType;
    controlId?: string;
  };

  if (!assessmentId || !artifactType) {
    return NextResponse.json({ error: "assessmentId and artifactType required" }, { status: 400 });
  }
  if (!VALID_TYPES.includes(artifactType)) {
    return NextResponse.json({ error: "Invalid artifactType" }, { status: 400 });
  }
  if (artifactType === "config_baseline" && !CONTROLS.some((c) => c.id === controlId)) {
    return NextResponse.json({ error: "config_baseline requires a valid controlId" }, { status: 400 });
  }

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
    return NextResponse.json(
      { error: "Artifact generation is only available for Remediation Package clients" },
      { status: 400 }
    );
  }

  const ctx = await buildContext(
    svc,
    assessmentId,
    assessment.client_id,
    client.company_name,
    ((client.cmmc_target_level as 1 | 2) ?? 2)
  );

  let result: GeneratedArtifact;
  try {
    if (artifactType === "ssp") result = await generateSSP(ctx);
    else if (artifactType === "poam") result = await generatePOAM(ctx);
    else if (artifactType === "policy_template") result = await generatePolicies(ctx);
    else if (artifactType === "responsibility_matrix") result = await generateResponsibilityMatrix(ctx);
    else result = await generateConfigBaseline(ctx, controlId!);
  } catch (err) {
    console.error("Artifact generation failed:", err);
    return NextResponse.json({ error: "Generation failed — try again" }, { status: 500 });
  }

  const title =
    artifactType === "config_baseline"
      ? `${ARTIFACT_TITLES.config_baseline} — ${controlId}`
      : ARTIFACT_TITLES[artifactType];

  let artifactId: string;
  try {
    artifactId = await persistArtifact(svc, {
      assessmentId,
      artifactType,
      controlId: artifactType === "config_baseline" ? controlId! : null,
      title,
      generatedBy: user.id,
      result,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Insert failed" }, { status: 500 });
  }

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "artifact.generated",
    entityType: "artifact",
    entityId: artifactId,
    metadata: { assessmentId, artifactType, controlId: controlId ?? null },
  });

  return NextResponse.json({ success: true, artifactId, content: result.content });
}
