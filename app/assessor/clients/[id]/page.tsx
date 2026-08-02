import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { calculateScore, ResponseMap, ResponseValue } from "@/lib/scoring";
import { CONTROLS, DOMAINS } from "@/lib/controls";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";
import GapRemediationPanel from "@/app/admin/clients/[id]/GapRemediationPanel";
import AssessmentLifecycleBar from "@/app/admin/clients/[id]/AssessmentLifecycleBar";
import AssessmentReviewPanel, { ControlReviewItem } from "@/app/admin/clients/[id]/AssessmentReviewPanel";
import InformationRequestsPanel from "@/app/admin/clients/[id]/InformationRequestsPanel";
import ArtifactGenerationPanel from "@/app/admin/clients/[id]/ArtifactGenerationPanel";
import RunAiButton from "@/app/admin/clients/[id]/RunAiButton";
import AssessmentSummaryPanel, { AssessmentSummary } from "@/app/admin/clients/[id]/AssessmentSummaryPanel";
import IntakeQuestionsPanel from "@/app/admin/clients/[id]/IntakeQuestionsPanel";
import NextStepBanner, { NextStep } from "./NextStepBanner";
import CollapsibleSection from "./CollapsibleSection";
import { formatScopingForPrompt } from "@/lib/scoping-questions";
import objectivesData from "@/data/assessment-objectives.json";

const controlsMap = new Map(CONTROLS.map((c) => [c.id, c]));
const domainsMap = new Map(DOMAINS.map((d) => [d.code, d]));

const STATUS_PRIORITY = [
  "under_review", "remediation_required", "submitted",
  "resubmitted", "in_progress", "approved", "finalized",
];

export default async function AssessorClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(roleRow?.role ?? "")) redirect("/portal/dashboard");

  const { data: client } = await svc
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!client) notFound();

  const { data: assessments } = await svc
    .from("assessments")
    .select("id, status, started_at, completed_at, assigned_to")
    .eq("client_id", params.id)
    .order("started_at", { ascending: false });

  const activeAssessment =
    STATUS_PRIORITY.map((s) => assessments?.find((a) => a.status === s))
      .find(Boolean) ?? assessments?.[0];

  let responses: ResponseMap = {};
  let responseRows: { control_id: string; response: string; notes: string | null; no_artifacts: boolean; no_policy_document: boolean; no_implementation_artifact: boolean }[] = [];
  let gapControlIds: string[] = [];

  if (activeAssessment) {
    const { data } = await svc
      .from("assessment_responses")
      .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
      .eq("assessment_id", activeAssessment.id);
    if (data) {
      responseRows = data as typeof responseRows;
      responses = Object.fromEntries(data.map((r) => [r.control_id, r.response])) as ResponseMap;
      gapControlIds = data.filter((r) => r.response === "no").map((r) => r.control_id);
    }
  }

  type GapControl = { id: string; domain: string; domain_code: string; description: string; guidance: string };
  let gapControls: GapControl[] = [];
  if (gapControlIds.length > 0) {
    const { data } = await svc
      .from("controls")
      .select("id, domain, domain_code, description, guidance")
      .in("id", gapControlIds);
    if (data) gapControls = data as GapControl[];
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let artifactRows: { id: string; control_id: string; file_name: string; file_size: number | null; storage_path: string; uploaded_at: string; artifact_type: "policy" | "implementation" | null }[] = [];
  if (activeAssessment) {
    const { data } = await svc
      .from("artifacts")
      .select("id, control_id, file_name, file_size, storage_path, uploaded_at, artifact_type")
      .eq("assessment_id", activeAssessment.id)
      .order("uploaded_at", { ascending: false });
    artifactRows = (data ?? []) as typeof artifactRows;
  }

  const artifactsWithUrls = await Promise.all(
    artifactRows.map(async (a) => {
      const { data } = await storageClient.storage.from("artifacts").createSignedUrl(a.storage_path, 3600);
      return { ...a, signedUrl: data?.signedUrl ?? null };
    })
  );

  const aiFeedbackMap: Record<string, { verdict: string; feedback: string; generated_at: string; objective_results: { id: string; met: string; note?: string }[] | null }> = {};
  if (activeAssessment) {
    const { data } = await svc
      .from("control_ai_feedback")
      .select("control_id, verdict, feedback, generated_at, objective_results")
      .eq("assessment_id", activeAssessment.id);
    for (const f of data ?? []) aiFeedbackMap[f.control_id] = f;
  }

  const determinationsMap: Record<string, { assessor_verdict: string; assessor_notes: string | null; objective_verdicts: Record<string, string> | null; reviewed_at: string }> = {};
  if (activeAssessment) {
    const { data } = await svc
      .from("assessor_determinations")
      .select("control_id, assessor_verdict, assessor_notes, objective_verdicts, reviewed_at")
      .eq("assessment_id", activeAssessment.id);
    for (const d of data ?? []) determinationsMap[d.control_id] = d;
  }

  const reviewItems: ControlReviewItem[] = responseRows
    .filter((r) => r.response === "yes" || r.response === "partial")
    .map((r) => {
      const control = controlsMap.get(r.control_id);
      const domain = domainsMap.get((control?.domain_code ?? "") as "AC");
      const ai = aiFeedbackMap[r.control_id] ?? null;
      const det = determinationsMap[r.control_id] ?? null;
      return {
        controlId: r.control_id,
        description: control?.description ?? r.control_id,
        domain: domain?.name ?? control?.domain ?? "",
        domainCode: control?.domain_code ?? "",
        domainColor: (domain?.color as string) ?? "#888",
        clientResponse: r.response,
        clientNotes: r.notes ?? null,
        noArtifacts: r.no_artifacts ?? false,
        noPolicyDocument: (r.no_artifacts || r.no_policy_document) ?? false,
        noImplementationArtifact: (r.no_artifacts || r.no_implementation_artifact) ?? false,
        aiVerdict: ai?.verdict ?? null,
        aiFeedback: ai?.feedback ?? null,
        aiGeneratedAt: ai?.generated_at ?? null,
        assessorVerdict: det?.assessor_verdict ?? null,
        assessorNotes: det?.assessor_notes ?? null,
        reviewedAt: det?.reviewed_at ?? null,
        objectives: (objectivesData as Record<string, { objectives: { id: string; text: string }[] }>)[r.control_id]?.objectives ?? [],
        aiObjectiveResults: ai?.objective_results ?? [],
        objectiveVerdicts: det?.objective_verdicts ?? {},
      };
    })
    .sort((a, b) => {
      if ((a.assessorVerdict === null) !== (b.assessorVerdict === null)) {
        return a.assessorVerdict === null ? -1 : 1;
      }
      return a.controlId.localeCompare(b.controlId);
    });

  let summary: AssessmentSummary | null = null;
  let scopingText: string | null = null;
  if (activeAssessment) {
    const [{ data: summaryRow }, { data: scopingRow }] = await Promise.all([
      svc.from("assessment_summaries")
        .select("overall_verdict, narrative, sprs_estimate, poam_eligible, domain_rollups, top_blockers, contradictions, generated_at")
        .eq("assessment_id", activeAssessment.id)
        .maybeSingle(),
      svc.from("assessment_scoping")
        .select("answers")
        .eq("assessment_id", activeAssessment.id)
        .maybeSingle(),
    ]);
    summary = (summaryRow as AssessmentSummary | null) ?? null;
    if (scopingRow?.answers && Object.keys(scopingRow.answers).length > 0) {
      scopingText = formatScopingForPrompt(scopingRow.answers as Record<string, unknown>);
    }
  }

  const targetLevel = (client.cmmc_target_level as 1 | 2) ?? 2;
  const verdictToResponse: Record<string, ResponseValue> = { met: "yes", partially_met: "partial", not_met: "no" };
  const effectiveResponses: ResponseMap = { ...responses };
  for (const [cid, det] of Object.entries(determinationsMap)) {
    const r = verdictToResponse[det.assessor_verdict];
    if (r) effectiveResponses[cid] = r;
  }
  const determinationCount = Object.keys(determinationsMap).length;
  const score = calculateScore(effectiveResponses, targetLevel);

  // ---- Progress + next-step guidance ----
  const totalReview = reviewItems.length;
  const reviewedCount = reviewItems.filter((i) => i.assessorVerdict !== null).length;
  const remainingReview = totalReview - reviewedCount;
  const determinationsComplete = totalReview === 0 ? true : reviewedCount === totalReview;
  const isRemediation = client.engagement_type === "remediation";
  const status = activeAssessment?.status ?? null;

  let nextStep: NextStep;
  if (!activeAssessment) {
    nextStep = { title: "No assessment started", body: "This client hasn't started an assessment yet. Nothing to review.", tone: "wait" };
  } else if (status === "in_progress") {
    nextStep = { title: "Assessment in progress", body: "The client is still completing their assessment and hasn't submitted it yet. Check back once they submit.", tone: "wait" };
  } else if (status === "submitted") {
    nextStep = { title: "Ready to review", body: "The client has submitted. Click Begin Review in the status bar to start assessing their controls.", cta: { label: "Go to status bar", anchor: "#lifecycle" }, tone: "action" };
  } else if (status === "resubmitted") {
    nextStep = { title: "Ready to re-review", body: "The client resubmitted after remediation. Click Begin Re-Review in the status bar to continue.", cta: { label: "Go to status bar", anchor: "#lifecycle" }, tone: "action" };
  } else if (status === "under_review") {
    if (totalReview > 0 && remainingReview > 0) {
      nextStep = {
        title: `${reviewedCount} of ${totalReview} controls reviewed`,
        body: `Record your determination for the remaining ${remainingReview} control${remainingReview === 1 ? "" : "s"} in Control Review, then approve or request remediation.`,
        cta: { label: "Go to Control Review", anchor: "#control-review" },
        tone: "action",
      };
    } else {
      nextStep = {
        title: "All controls reviewed",
        body: "You've recorded a determination for every control. Approve the assessment or request remediation in the status bar.",
        cta: { label: "Go to status bar", anchor: "#lifecycle" },
        tone: "action",
      };
    }
  } else if (status === "remediation_required") {
    nextStep = {
      title: "Remediation requested",
      body: isRemediation
        ? "Waiting for the client to address the gaps and resubmit. Meanwhile, you can send information requests, collect gap intake, and generate artifacts below."
        : "Waiting for the client to address the gaps and resubmit their assessment.",
      tone: "wait",
    };
  } else if (status === "approved") {
    nextStep = { title: "Assessment approved", body: "Finalize the assessment in the status bar to complete the engagement.", cta: { label: "Go to status bar", anchor: "#lifecycle" }, tone: "action" };
  } else if (status === "finalized") {
    nextStep = { title: "Assessment finalized", body: "This engagement is complete. No further action is required.", tone: "done" };
  } else {
    nextStep = { title: status?.replace(/_/g, " ") ?? "Unknown", body: "", tone: "wait" };
  }

  const reviewOpen = status === "under_review" || status === "resubmitted";
  const controlBadge = totalReview === 0
    ? null
    : { text: `${reviewedCount}/${totalReview} done`, color: determinationsComplete ? "#4DFFA0" : "#FFB347" };

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  };
  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <a href="/assessor/dashboard" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none", display: "inline-block", marginBottom: 12 }}>
          ← Back to Clients
        </a>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
          {client.company_name}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>{client.contact_name}</span>
          <span>· CMMC Level {client.cmmc_target_level}</span>
          <span style={{ color: stageColor[client.engagement_stage] ?? "#888", textTransform: "capitalize" }}>
            · {client.engagement_stage}
          </span>
          <span style={{ color: client.engagement_type === "remediation" ? "#4DFFA0" : "#00C9FF" }}>
            · {client.engagement_type === "remediation" ? "Remediation Package" : "Assessment Only"}
          </span>
        </div>
      </div>

      {/* What to do next */}
      <NextStepBanner step={nextStep} />

      {/* Assessment lifecycle */}
      <div id="lifecycle">
        {activeAssessment && activeAssessment.status !== "in_progress" && (
          <AssessmentLifecycleBar assessmentId={activeAssessment.id} currentStatus={activeAssessment.status} />
        )}
      </div>
      {activeAssessment?.status === "in_progress" && (
        <div style={{
          fontSize: 12, color: "#00C9FF", background: "rgba(0,201,255,0.06)",
          border: "1px solid rgba(0,201,255,0.15)", borderRadius: 10, padding: "10px 16px", marginBottom: 24,
        }}>
          Assessment is in progress — client has not yet submitted.
        </div>
      )}

      {/* Score metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
        {score.sprs ? (
          <div style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>SPRS Score</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: !score.sprs.scoreable ? "#F87171" : score.sprs.score >= 88 ? "#4DFFA0" : score.sprs.score >= 0 ? "#FFB347" : "#F87171" }}>
              {score.sprs.scoreable ? String(score.sprs.score) : "No SSP"}
            </div>
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Level 1 Status</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: score.gaps === 0 ? "#4DFFA0" : "#F87171" }}>
              {score.gaps === 0 ? "Compliant" : "Non-Compliant"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{score.passed} / 17 practices</div>
          </div>
        )}
        {[
          { label: "Readiness Score", value: `${score.overallScore}%`, color: score.overallScore >= 70 ? "#4DFFA0" : score.overallScore >= 40 ? "#FFB347" : "#F87171" },
          { label: "Gaps (No)",        value: String(score.gaps),    color: "#F87171" },
          { label: "Passed (Yes)",     value: String(score.passed),  color: "#4DFFA0" },
          { label: "Partial",          value: String(score.partial), color: "#FFB347" },
        ].map((m) => (
          <div key={m.label} style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {score.sprs && (
        <div style={{
          fontSize: 12, borderRadius: 10, padding: "10px 16px", marginBottom: 24,
          color: score.sprs.poamEligible ? "#4DFFA0" : "rgba(255,255,255,0.55)",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        }}>
          {!score.sprs.scoreable
            ? "SPRS score cannot be calculated: 3.12.4 (System Security Plan) is not in place."
            : score.sprs.poamEligible
            ? `POA&M eligible for CMMC Level 2 Conditional status.`
            : `Not POA&M eligible: ${score.sprs.score < 88 ? `score ${score.sprs.score} below 88-point minimum` : ""}${score.sprs.poamBlockers.length > 0 ? ` — ${score.sprs.poamBlockers.length} must-fix gap(s) that cannot ride on a POA&M` : ""}`}
        </div>
      )}
      {targetLevel === 1 && (
        <div style={{
          fontSize: 12, borderRadius: 10, padding: "10px 16px", marginBottom: 24,
          color: score.gaps === 0 ? "#4DFFA0" : "rgba(255,255,255,0.55)",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        }}>
          {score.gaps === 0
            ? "All 17 FAR 52.204-21 practices implemented."
            : `${score.gaps} gap(s) identified.`}
          {determinationCount > 0 && ` Score reflects ${determinationCount} assessor determination${determinationCount === 1 ? "" : "s"}.`}
        </div>
      )}

      {summary && <AssessmentSummaryPanel summary={summary} />}

      {scopingText && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Environment Scoping Profile</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {scopingText}
          </div>
        </div>
      )}

      {/* Score gauge + domain breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Readiness Score</div>
          <ScoreGauge score={score.overallScore} size={140} />
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Domain Breakdown</div>
          {score.domainScores.slice(0, 7).map((d) => (
            <DomainBar key={d.code} domainCode={d.code} score={d.score} />
          ))}
        </div>
      </div>

      {/* Client info — read-only */}
      <div style={{ ...card, marginBottom: 32 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Client Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { label: "Contact",          value: client.contact_name },
            { label: "Phone",            value: client.phone ?? "—" },
            { label: "Target Level",     value: `CMMC Level ${client.cmmc_target_level}` },
            { label: "Engagement Stage", value: client.engagement_stage },
            { label: "Package",          value: client.engagement_type === "remediation" ? "Remediation Package" : "Assessment Only" },
            { label: "Assessment",       value: activeAssessment ? activeAssessment.status.replace(/_/g, " ") : "Not started" },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 14, color: "#E2E8F0", textTransform: "capitalize" }}>{f.value}</div>
            </div>
          ))}
        </div>
        {client.notes && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{client.notes}</div>
          </div>
        )}
      </div>

      {/* Workflow */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 14 }}>
        Assessment Workflow
      </div>

      {/* 1. Control Review */}
      <CollapsibleSection
        id="control-review"
        title="1. Control Review"
        subtitle="Review AI recommendations and record your determination for each control."
        badge={controlBadge}
        defaultOpen={reviewOpen}
      >
        {activeAssessment && (
          <div style={{ marginBottom: 20 }}>
            <RunAiButton assessmentId={activeAssessment.id} />
          </div>
        )}
        {reviewItems.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No controls to review yet. Controls appear here after the client submits their assessment.
          </div>
        ) : (
          <AssessmentReviewPanel assessmentId={activeAssessment!.id} items={reviewItems} />
        )}
      </CollapsibleSection>

      {/* 2. Gap Remediation */}
      <CollapsibleSection
        title="2. Gap Remediation"
        subtitle="Write and approve remediation guidance for controls the client marked Not Implemented."
        badge={gapControls.length > 0 ? { text: `${gapControls.length} gap${gapControls.length === 1 ? "" : "s"}`, color: "#F87171" } : { text: "No gaps", color: "#4DFFA0" }}
        defaultOpen={reviewOpen && gapControls.length > 0}
      >
        {gapControls.length === 0 ? (
          <div style={{ ...card, fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 32 }}>
            No gaps to remediate.
          </div>
        ) : (
          <GapRemediationPanel assessmentId={activeAssessment!.id} gaps={gapControls} />
        )}
      </CollapsibleSection>

      {/* Remediation package only: steps 3–5, locked until determinations complete */}
      {isRemediation && activeAssessment && (
        <>
          <CollapsibleSection
            title="3. Information Requests"
            subtitle="Request additional information from the client."
            locked={!determinationsComplete}
            lockedReason="Available once you've recorded a determination for every control in Control Review."
          >
            <InformationRequestsPanel assessmentId={activeAssessment.id} />
          </CollapsibleSection>

          <CollapsibleSection
            title="4. Gap Intake Questions"
            subtitle="Generate plain-language questions about a gap to collect facts for artifact generation."
            locked={!determinationsComplete}
            lockedReason="Available once you've recorded a determination for every control in Control Review."
          >
            <IntakeQuestionsPanel
              assessmentId={activeAssessment.id}
              gaps={responseRows
                .filter((r) => {
                  const aiVerdict = aiFeedbackMap[r.control_id]?.verdict;
                  return r.response === "no" || r.response === "partial" ||
                    aiVerdict === "not_met" || aiVerdict === "partially_met";
                })
                .map((r) => ({
                  id: r.control_id,
                  description: controlsMap.get(r.control_id)?.description ?? r.control_id,
                  verdict: aiFeedbackMap[r.control_id]?.verdict ?? r.response,
                }))
                .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="5. Compliance Artifacts"
            subtitle="Generate SSP, POA&M, and policy templates based on assessment data and determinations."
            locked={!determinationsComplete}
            lockedReason="Available once you've recorded a determination for every control in Control Review."
          >
            <ArtifactGenerationPanel
              assessmentId={activeAssessment.id}
              gaps={responseRows
                .filter((r) => {
                  const aiVerdict = aiFeedbackMap[r.control_id]?.verdict;
                  return r.response === "no" || r.response === "partial" ||
                    aiVerdict === "not_met" || aiVerdict === "partially_met";
                })
                .map((r) => ({
                  id: r.control_id,
                  description: controlsMap.get(r.control_id)?.description ?? r.control_id,
                }))}
            />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
