import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ArtifactType = "ssp" | "poam" | "policy_template";

const ARTIFACT_TITLES: Record<ArtifactType, string> = {
  ssp: "System Security Plan (SSP)",
  poam: "Plan of Action & Milestones (POA&M)",
  policy_template: "Policy & Procedure Templates",
};

function buildSSPPrompt(
  companyName: string,
  level: number,
  controls: { id: string; description: string; verdict: string; notes: string | null; guidance: string }[]
): string {
  const implemented = controls.filter((c) => c.verdict === "met" || c.verdict === "partially_met");
  const controlList = implemented
    .map(
      (c) =>
        `${c.id}: ${c.description}\n  Determination: ${c.verdict.replace(/_/g, " ").toUpperCase()}\n  Evidence/Notes: ${c.notes ?? "(none provided)"}`
    )
    .join("\n\n");

  return `You are a CMMC/NIST SP 800-171 compliance specialist. Generate a System Security Plan (SSP) for the following defense contractor.

## Client Information
Company: ${companyName}
CMMC Target Level: ${level}

## Controls With Documented Implementation
${controlList || "(No controls fully implemented yet)"}

## Instructions
Write a professional SSP document that:
1. Opens with an Executive Summary / System Description (2-3 paragraphs describing the organization's cybersecurity posture based on the evidence)
2. For each implemented or partially-implemented control, write a Control Implementation Statement describing how the organization addresses that requirement. Base it on the notes and evidence provided. Use professional, formal language appropriate for a federal compliance document.
3. Use the format:
   **[Control ID] — [Short Control Name]**
   *Status: Met / Partially Met*
   Implementation Statement: [2-4 sentences describing current implementation]

4. End with a section titled "Known Gaps & Remediation Commitment" listing any partially-met controls and what additional work is needed.

Write the full document now. Be professional, specific, and grounded in the actual evidence provided.`;
}

function buildPOAMPrompt(
  companyName: string,
  level: number,
  controls: { id: string; description: string; verdict: string; notes: string | null; guidance: string }[]
): string {
  const gaps = controls.filter((c) => c.verdict === "not_met" || c.verdict === "partially_met" || c.verdict === "needs_review");
  const gapList = gaps
    .map(
      (c) =>
        `${c.id}: ${c.description}\n  Status: ${c.verdict.replace(/_/g, " ").toUpperCase()}\n  Assessment Notes: ${c.notes ?? "(none)"}\n  Guidance: ${c.guidance}`
    )
    .join("\n\n");

  return `You are a CMMC/NIST SP 800-171 compliance specialist. Generate a Plan of Action & Milestones (POA&M) for the following defense contractor.

## Client Information
Company: ${companyName}
CMMC Target Level: ${level}

## Identified Gaps
${gapList || "(No gaps identified — all controls met)"}

## Instructions
Write a formal POA&M document that:
1. Opens with a brief introduction (1-2 paragraphs) identifying the purpose and scope
2. For each gap, create a structured POA&M entry with these fields:
   - **Item #**: Sequential number
   - **Control**: Control ID and description
   - **Weakness/Gap**: Specific gap identified based on assessment notes
   - **Recommended Remediation**: Concrete, actionable steps to close the gap (3-5 bullet points)
   - **Responsible Party**: "IT/Security Team" (or more specific if notes suggest)
   - **Target Completion**: Suggested timeline (use 30 days for critical/simple, 60 days for moderate, 90 days for complex/organizational)
   - **Resources Required**: Brief list of what's needed (tools, training, policies, etc.)

3. End with a summary table listing all items, their gap category, and target dates.

Write the full POA&M document now. Be specific, actionable, and realistic about timelines.`;
}

function buildPolicyPrompt(
  companyName: string,
  level: number,
  controls: { id: string; description: string; verdict: string; notes: string | null; guidance: string }[]
): string {
  // Identify which policy domains have gaps
  const gaps = controls.filter((c) => c.verdict === "not_met" || c.verdict === "partially_met");
  const domainCodes = Array.from(new Set(gaps.map((c) => c.id.split(".")[0])));

  const DOMAIN_TO_POLICY: Record<string, string> = {
    "3.1": "Access Control Policy",
    "3.2": "Awareness and Training Policy",
    "3.3": "Audit and Accountability Policy",
    "3.4": "Configuration Management Policy",
    "3.5": "Identification and Authentication Policy",
    "3.6": "Incident Response Policy",
    "3.7": "Maintenance Policy",
    "3.8": "Media Protection Policy",
    "3.9": "Personnel Security Policy",
    "3.10": "Physical Protection Policy",
    "3.11": "Risk Assessment Policy",
    "3.12": "Security Assessment Policy",
    "3.13": "System and Communications Protection Policy",
    "3.14": "System and Information Integrity Policy",
  };

  const neededPolicies = domainCodes
    .map((code) => DOMAIN_TO_POLICY[code])
    .filter(Boolean)
    .slice(0, 4); // Cap at 4 policies for token budget

  const gapSummary = gaps
    .slice(0, 15)
    .map((c) => `- ${c.id}: ${c.description} (${c.verdict.replace(/_/g, " ")})`)
    .join("\n");

  return `You are a CMMC/NIST SP 800-171 compliance specialist. Generate policy and procedure templates for the following defense contractor.

## Client Information
Company: ${companyName}
CMMC Target Level: ${level}

## Key Gaps Requiring Policy Support
${gapSummary || "(No specific gaps — generating general policy templates)"}

## Policies to Generate
${neededPolicies.length > 0 ? neededPolicies.join("\n") : "Access Control Policy\nIncident Response Policy\nConfiguration Management Policy"}

## Instructions
For each policy listed above, write a complete policy template:

**[POLICY NAME]**
Version: 1.0 | Effective Date: [Current Date] | Review Date: [One Year from Now]

1. **Purpose**: Why this policy exists
2. **Scope**: Who and what systems it applies to
3. **Policy Statements**: 8-12 specific, enforceable policy statements (numbered list)
4. **Roles & Responsibilities**: Who owns what
5. **Procedures**: Step-by-step procedures for the most critical activities covered by this policy
6. **Compliance**: Consequences of non-compliance, review cycle

Write all policies now. Use formal, clear language appropriate for a professional organization seeking CMMC certification. Replace [COMPANY NAME] with ${companyName}.`;
}

export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { session } } = await authSupabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", session.user.id).single();
  if (role?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { assessmentId, artifactType } = await req.json() as { assessmentId: string; artifactType: ArtifactType };

  if (!assessmentId || !artifactType) {
    return NextResponse.json({ error: "assessmentId and artifactType required" }, { status: 400 });
  }
  if (!["ssp", "poam", "policy_template"].includes(artifactType)) {
    return NextResponse.json({ error: "Invalid artifactType" }, { status: 400 });
  }

  // Fetch assessment + client info
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

  // Only for remediation package clients
  if (client.engagement_type !== "remediation") {
    return NextResponse.json({ error: "Artifact generation is only available for Remediation Package clients" }, { status: 400 });
  }

  // Fetch all assessment responses
  const { data: responses } = await svc
    .from("assessment_responses")
    .select("control_id, response, notes")
    .eq("assessment_id", assessmentId);

  // Fetch assessor determinations (prefer over AI)
  const { data: determinations } = await svc
    .from("assessor_determinations")
    .select("control_id, assessor_verdict, assessor_notes")
    .eq("assessment_id", assessmentId);

  // Fetch AI feedback as fallback
  const { data: aiFeedback } = await svc
    .from("control_ai_feedback")
    .select("control_id, verdict, feedback")
    .eq("assessment_id", assessmentId);

  // Import controls data
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const controlsJson = require("@/data/nist-800-171-controls.json") as Array<{ id: string; description: string; guidance?: string }>;
  const controlsMap = new Map(controlsJson.map((c) => [c.id, c]));

  const detMap = new Map((determinations ?? []).map((d) => [d.control_id, d]));
  const aiMap = new Map((aiFeedback ?? []).map((f) => [f.control_id, f]));

  // Build enriched control list (only yes/partial responses — these are the ones that were analyzed)
  const controls = (responses ?? [])
    .filter((r) => r.response === "yes" || r.response === "partial" || r.response === "no")
    .map((r) => {
      const control = controlsMap.get(r.control_id);
      const det = detMap.get(r.control_id);
      const ai = aiMap.get(r.control_id);
      const verdict = det?.assessor_verdict ?? ai?.verdict ?? (r.response === "no" ? "not_met" : "needs_review");
      const notes = det?.assessor_notes ?? r.notes ?? null;
      return {
        id: r.control_id,
        description: control?.description ?? r.control_id,
        guidance: control?.guidance ?? "",
        verdict,
        notes,
      };
    });

  // Build prompt based on artifact type
  let prompt: string;
  if (artifactType === "ssp") {
    prompt = buildSSPPrompt(client.company_name, client.cmmc_target_level ?? 2, controls);
  } else if (artifactType === "poam") {
    prompt = buildPOAMPrompt(client.company_name, client.cmmc_target_level ?? 2, controls);
  } else {
    prompt = buildPolicyPrompt(client.company_name, client.cmmc_target_level ?? 2, controls);
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const content = message.content[0].type === "text" ? message.content[0].text : "";

  const now = new Date().toISOString();

  // Upsert — replace any existing draft for this assessment + type
  const { data: existing } = await svc
    .from("generated_artifacts")
    .select("id")
    .eq("assessment_id", assessmentId)
    .eq("artifact_type", artifactType)
    .eq("status", "draft")
    .single();

  let artifactId: string;

  if (existing) {
    await svc
      .from("generated_artifacts")
      .update({ content, generated_by: session.user.id, generated_at: now, updated_at: now })
      .eq("id", existing.id);
    artifactId = existing.id;
  } else {
    const { data: inserted } = await svc
      .from("generated_artifacts")
      .insert({
        assessment_id: assessmentId,
        artifact_type: artifactType,
        title: ARTIFACT_TITLES[artifactType],
        content,
        status: "draft",
        generated_by: session.user.id,
        generated_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    artifactId = inserted!.id;
  }

  return NextResponse.json({ success: true, artifactId, content });
}
