import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { CONTROLS, DOMAINS } from "@/lib/controls";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";
import GapRemediationPanel from "./GapRemediationPanel";
import ResetPasswordButton from "./ResetPasswordButton";
import AssessmentLifecycleBar from "./AssessmentLifecycleBar";
import AssessmentReviewPanel, { ControlReviewItem } from "./AssessmentReviewPanel";
import InformationRequestsPanel from "./InformationRequestsPanel";
import ArtifactGenerationPanel from "./ArtifactGenerationPanel";
import ClientInfoEditor from "./ClientInfoEditor";
import RunAiButton from "./RunAiButton";
import AssessmentSummaryPanel, { AssessmentSummary } from "./AssessmentSummaryPanel";
import IntakeQuestionsPanel from "./IntakeQuestionsPanel";
import AssignAssessorSelect from "./AssignAssessorSelect";
import { formatScopingForPrompt } from "@/lib/scoping-questions";

const controlsMap = new Map(CONTROLS.map((c) => [c.id, c]));
const domainsMap = new Map(DOMAINS.map((d) => [d.code, d]));

const STATUS_PRIORITY = [
  "under_review", "remediation_required", "submitted",
  "resubmitted", "in_progress", "approved", "finalized",
];

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!client) notFound();

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, status, started_at, completed_at, assigned_to")
    .eq("client_id", params.id)
    .order("started_at", { ascending: false });

  const activeAssessment =
    STATUS_PRIORITY.map((s) => assessments?.find((a) => a.status === s))
      .find(Boolean) ?? assessments?.[0];

  // Fetch responses WITH notes for review panel
  let responses: ResponseMap = {};
  let responseRows: { control_id: string; response: string; notes: string | null; no_artifacts: boolean }[] = [];
  let gapControlIds: string[] = [];

  if (activeAssessment) {
    const { data } = await supabase
      .from("assessment_responses")
      .select("control_id, response, notes, no_artifacts")
      .eq("assessment_id", activeAssessment.id);
    if (data) {
      responseRows = data;
      responses = Object.fromEntries(data.map((r) => [r.control_id, r.response])) as ResponseMap;
      gapControlIds = data.filter((r) => r.response === "no").map((r) => r.control_id);
    }
  }

  // Gap controls for remediation panel
  type GapControl = { id: string; domain: string; domain_code: string; description: string; guidance: string };
  let gapControls: GapControl[] = [];
  if (gapControlIds.length > 0) {
    const { data } = await supabase
      .from("controls")
      .select("id, domain, domain_code, description, guidance")
      .in("id", gapControlIds);
    if (data) gapControls = data as GapControl[];
  }

  // Artifacts
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let artifactRows: { id: string; control_id: string; file_name: string; file_size: number | null; storage_path: string; uploaded_at: string }[] = [];
  if (activeAssessment) {
    const { data } = await supabase
      .from("artifacts")
      .select("id, control_id, file_name, file_size, storage_path, uploaded_at")
      .eq("assessment_id", activeAssessment.id)
      .order("uploaded_at", { ascending: false });
    artifactRows = data ?? [];
  }

  const artifactsWithUrls = await Promise.all(
    artifactRows.map(async (a) => {
      const { data } = await storageClient.storage.from("artifacts").createSignedUrl(a.storage_path, 3600);
      return { ...a, signedUrl: data?.signedUrl ?? null };
    })
  );

  const artifactsByControl: Record<string, typeof artifactsWithUrls> = {};
  for (const a of artifactsWithUrls) {
    if (!artifactsByControl[a.control_id]) artifactsByControl[a.control_id] = [];
    artifactsByControl[a.control_id].push(a);
  }

  // AI feedback
  const aiFeedbackMap: Record<string, { verdict: string; feedback: string; generated_at: string }> = {};
  if (activeAssessment) {
    const { data } = await supabase
      .from("control_ai_feedback")
      .select("control_id, verdict, feedback, generated_at")
      .eq("assessment_id", activeAssessment.id);
    for (const f of data ?? []) aiFeedbackMap[f.control_id] = f;
  }

  // Assessor determinations
  const determinationsMap: Record<string, { assessor_verdict: string; assessor_notes: string | null; reviewed_at: string }> = {};
  if (activeAssessment) {
    const { data } = await supabase
      .from("assessor_determinations")
      .select("control_id, assessor_verdict, assessor_notes, reviewed_at")
      .eq("assessment_id", activeAssessment.id);
    for (const d of data ?? []) determinationsMap[d.control_id] = d;
  }

  // Build ControlReviewItems for yes/partial controls
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
        aiVerdict: ai?.verdict ?? null,
        aiFeedback: ai?.feedback ?? null,
        aiGeneratedAt: ai?.generated_at ?? null,
        assessorVerdict: det?.assessor_verdict ?? null,
        assessorNotes: det?.assessor_notes ?? null,
        reviewedAt: det?.reviewed_at ?? null,
      };
    })
    .sort((a, b) => {
      // Unreviewed first, then by controlId
      if ((a.assessorVerdict === null) !== (b.assessorVerdict === null)) {
        return a.assessorVerdict === null ? -1 : 1;
      }
      return a.controlId.localeCompare(b.controlId);
    });

  // Client document library (with confirmed control mappings)
  const { data: libraryDocs } = await supabase
    .from("documents")
    .select("id, file_name, title, doc_type, storage_path, uploaded_at, document_control_links(control_id, status)")
    .eq("client_id", params.id)
    .order("uploaded_at", { ascending: false });

  const libraryWithUrls = await Promise.all(
    (libraryDocs ?? []).map(async (d) => {
      const { data } = await storageClient.storage.from("documents").createSignedUrl(d.storage_path, 3600);
      const links = (d.document_control_links ?? []) as { control_id: string; status: string }[];
      return {
        id: d.id,
        name: d.title ?? d.file_name,
        docType: d.doc_type,
        uploadedAt: d.uploaded_at,
        signedUrl: data?.signedUrl ?? null,
        confirmed: links.filter((l) => l.status === "confirmed").map((l) => l.control_id),
        suggested: links.filter((l) => l.status === "suggested").length,
      };
    })
  );

  // Engagement-level AI synthesis + scoping profile
  let summary: AssessmentSummary | null = null;
  let scopingText: string | null = null;
  if (activeAssessment) {
    const [{ data: summaryRow }, { data: scopingRow }] = await Promise.all([
      supabase
        .from("assessment_summaries")
        .select("overall_verdict, narrative, sprs_estimate, poam_eligible, domain_rollups, top_blockers, contradictions, generated_at")
        .eq("assessment_id", activeAssessment.id)
        .maybeSingle(),
      supabase
        .from("assessment_scoping")
        .select("answers")
        .eq("assessment_id", activeAssessment.id)
        .maybeSingle(),
    ]);
    summary = (summaryRow as AssessmentSummary | null) ?? null;
    if (scopingRow?.answers && Object.keys(scopingRow.answers).length > 0) {
      scopingText = formatScopingForPrompt(scopingRow.answers as Record<string, unknown>);
    }
  }

  const score = calculateScore(responses, (client.cmmc_target_level as 1 | 2) ?? 2);
  const card: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
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
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {activeAssessment && (
            <AssignAssessorSelect
              assessmentId={activeAssessment.id}
              assignedTo={(activeAssessment as { assigned_to?: string | null }).assigned_to ?? null}
            />
          )}
          <ResetPasswordButton clientId={params.id} />
        </div>
      </div>

      {/* Assessment lifecycle bar — only when assessment exists and not in_progress */}
      {activeAssessment && activeAssessment.status !== "in_progress" && (
        <AssessmentLifecycleBar
          assessmentId={activeAssessment.id}
          currentStatus={activeAssessment.status}
        />
      )}
      {activeAssessment?.status === "in_progress" && (
        <div style={{
          fontSize: 12, color: "#00C9FF", background: "rgba(0,201,255,0.06)",
          border: "1px solid rgba(0,201,255,0.15)", borderRadius: 10, padding: "10px 16px",
          marginBottom: 24,
        }}>
          Assessment is in progress — client has not yet submitted.
        </div>
      )}
      {!activeAssessment && (
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 16px",
          marginBottom: 24,
        }}>
          No assessment started yet.
        </div>
      )}

      {/* Score metrics (assessor-only) */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${score.sprs ? 5 : 4}, 1fr)`, gap: 16, marginBottom: 24 }}>
        {[
          ...(score.sprs ? [{
            label: "SPRS Score",
            value: score.sprs.scoreable ? String(score.sprs.score) : "No SSP",
            color: !score.sprs.scoreable ? "#F87171" : score.sprs.score >= 88 ? "#4DFFA0" : score.sprs.score >= 0 ? "#FFB347" : "#F87171",
          }] : []),
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
            ? "SPRS score cannot be calculated: 3.12.4 (System Security Plan) is not in place. An SSP is a precondition for a DoD assessment."
            : score.sprs.poamEligible
            ? `POA&M eligible for CMMC Level 2 Conditional status (score ≥ 88, all open gaps are 1-point items). Deductions: ${score.sprs.deductions.reduce((n, d) => n + d.points, 0)} points across ${score.sprs.deductions.length} requirements.`
            : `Not POA&M eligible: ${score.sprs.score < 88 ? `score ${score.sprs.score} is below the 88-point minimum` : ""}${score.sprs.score < 88 && score.sprs.poamBlockers.length > 0 ? "; " : ""}${score.sprs.poamBlockers.length > 0 ? `${score.sprs.poamBlockers.length} gap(s) on 3/5-point requirements (${score.sprs.poamBlockers.slice(0, 6).join(", ")}${score.sprs.poamBlockers.length > 6 ? "…" : ""})` : ""}`}
        </div>
      )}

      {/* Engagement-level readiness synthesis */}
      {summary && <AssessmentSummaryPanel summary={summary} />}

      {/* Client scoping profile */}
      {scopingText && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Environment Scoping Profile</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {scopingText}
          </div>
        </div>
      )}

      {/* Client document library */}
      {libraryWithUrls.length > 0 && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
            Document Library ({libraryWithUrls.length})
          </div>
          {libraryWithUrls.map((d, i) => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "9px 0",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none", fontSize: 13,
            }}>
              {d.signedUrl ? (
                <a href={d.signedUrl} target="_blank" rel="noreferrer" style={{ color: "#00C9FF", textDecoration: "none", fontWeight: 600 }}>
                  {d.name}
                </a>
              ) : (
                <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{d.name}</span>
              )}
              {d.docType && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>{d.docType}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                {d.confirmed.length > 0
                  ? `evidence for ${d.confirmed.length} control${d.confirmed.length === 1 ? "" : "s"}`
                  : "no confirmed mappings"}
                {d.suggested > 0 ? ` · ${d.suggested} pending` : ""}
              </span>
            </div>
          ))}
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

      {/* Client info */}
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
        <ClientInfoEditor
          clientId={params.id}
          engagementType={client.engagement_type ?? "assessment"}
          engagementStage={client.engagement_stage}
        />
      </div>

      {/* Assessment Review Panel */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
          Control Review
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
          Recommendations for controls the client answered Yes or Partial. Accept or override each determination.
        </div>
        {activeAssessment && (
          <div style={{ marginBottom: 20 }}>
            <RunAiButton assessmentId={activeAssessment.id} />
          </div>
        )}
        {reviewItems.length === 0 ? (
          <div style={{ ...card, textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No controls reviewed yet. Controls will appear here after the client submits their assessment.
          </div>
        ) : (
          <AssessmentReviewPanel assessmentId={activeAssessment!.id} items={reviewItems} />
        )}
      </div>

      {/* Gap Remediation Panel */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
          Gap Remediation
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
          Controls the client marked Not Implemented. Write and approve remediation guidance visible to the client.
        </div>
        {gapControls.length === 0 ? (
          <div style={{ ...card, fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 32 }}>
            No gaps to remediate.
          </div>
        ) : (
          <GapRemediationPanel assessmentId={activeAssessment!.id} gaps={gapControls} />
        )}
      </div>

      {/* Information Requests — remediation package only */}
      {client.engagement_type === "remediation" && activeAssessment && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Information Requests
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
            Request additional information from the client. They will see and respond to requests from their dashboard.
          </div>
          <InformationRequestsPanel assessmentId={activeAssessment.id} />
        </div>
      )}

      {/* Gap Intake Questions — remediation package only */}
      {client.engagement_type === "remediation" && activeAssessment && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Gap Intake Questions
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
            One click generates plain-language questions about a gap, grounded in everything the client
            already submitted. Their answers feed artifact generation below.
          </div>
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
        </div>
      )}

      {/* Artifact Generation — remediation package only */}
      {client.engagement_type === "remediation" && activeAssessment && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 6 }}>
            Compliance Artifacts
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>
            Generate SSP, POA&amp;M, and policy templates based on this client&apos;s assessment data and determinations.
          </div>
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
              }))
              .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))}
          />
        </div>
      )}

      {/* Evidence Artifacts */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 20 }}>
          Evidence Artifacts
        </div>
        {artifactsWithUrls.length === 0 ? (
          <div style={{ ...card, fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 32 }}>
            No evidence uploaded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.entries(artifactsByControl).map(([controlId, items]) => (
              <div key={controlId} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00C9FF" }}>{controlId}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 8px" }}>
                    {items.length} file{items.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((artifact) => (
                    <div key={artifact.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>📎</span>
                        <div>
                          {artifact.signedUrl ? (
                            <a href={artifact.signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#00C9FF", textDecoration: "none", fontWeight: 500 }}>
                              {artifact.file_name}
                            </a>
                          ) : (
                            <span style={{ fontSize: 13, color: "#E2E8F0" }}>{artifact.file_name}</span>
                          )}
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                            {artifact.file_size ? `${(artifact.file_size / 1024).toFixed(1)} KB · ` : ""}
                            {new Date(artifact.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
