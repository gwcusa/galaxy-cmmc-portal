import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";
import GapRemediationPanel from "./GapRemediationPanel";

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
    .select("id, status, started_at, completed_at")
    .eq("client_id", params.id)
    .order("started_at", { ascending: false });

  const activeAssessment = assessments?.find((a) => a.status === "in_progress") ?? assessments?.[0];

  let responses: ResponseMap = {};
  let gapControlIds: string[] = [];
  if (activeAssessment) {
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", activeAssessment.id);
    if (responseRows) {
      responses = Object.fromEntries(
        responseRows.map((r: { control_id: string; response: string }) => [r.control_id, r.response])
      ) as ResponseMap;
      gapControlIds = responseRows
        .filter((r: { control_id: string; response: string }) => r.response === "no")
        .map((r: { control_id: string; response: string }) => r.control_id);
    }
  }

  type GapControl = {
    id: string;
    domain: string;
    domain_code: string;
    description: string;
    guidance: string;
  };

  let gapControls: GapControl[] = [];
  if (gapControlIds.length > 0) {
    const { data: controlRows } = await supabase
      .from("controls")
      .select("id, domain, domain_code, description, guidance")
      .in("id", gapControlIds);
    if (controlRows) {
      gapControls = controlRows as GapControl[];
    }
  }

  // Fetch artifacts for this assessment
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let artifactRows: { id: string; control_id: string; file_name: string; file_size: number | null; storage_path: string; uploaded_at: string }[] = [];
  if (activeAssessment) {
    const { data: artifactData } = await supabase
      .from("artifacts")
      .select("id, control_id, file_name, file_size, storage_path, uploaded_at")
      .eq("assessment_id", activeAssessment.id)
      .order("uploaded_at", { ascending: false });
    artifactRows = artifactData ?? [];
  }

  // Generate signed URLs for all artifacts
  const artifactsWithUrls = await Promise.all(
    artifactRows.map(async (a) => {
      const { data: urlData } = await storageClient.storage
        .from("artifacts")
        .createSignedUrl(a.storage_path, 3600);
      return { ...a, signedUrl: urlData?.signedUrl ?? null };
    })
  );

  // Group by control_id
  const artifactsByControl: Record<string, typeof artifactsWithUrls> = {};
  for (const a of artifactsWithUrls) {
    if (!artifactsByControl[a.control_id]) artifactsByControl[a.control_id] = [];
    artifactsByControl[a.control_id].push(a);
  }

  // Fetch AI feedback for this assessment
  let aiFeedbackRows: { control_id: string; verdict: string; feedback: string; generated_at: string }[] = [];
  if (activeAssessment) {
    const { data: feedbackData } = await supabase
      .from("control_ai_feedback")
      .select("control_id, verdict, feedback, generated_at")
      .eq("assessment_id", activeAssessment.id);
    aiFeedbackRows = feedbackData ?? [];
  }

  // Build lookup map
  const aiFeedbackMap: Record<string, { verdict: string; feedback: string; generated_at: string }> = {};
  for (const f of aiFeedbackRows) {
    aiFeedbackMap[f.control_id] = f;
  }

  const score = calculateScore(responses, (client.cmmc_target_level as 1 | 2) ?? 2);
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>{client.company_name}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {client.contact_name} · CMMC Level {client.cmmc_target_level} ·{" "}
            <span style={{ color: stageColor[client.engagement_stage] ?? "#888", textTransform: "capitalize" }}>
              {client.engagement_stage}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Overall Score", value: `${score.overallScore}%`, color: score.overallScore >= 70 ? "#4DFFA0" : "#FFB347" },
          { label: "Gaps", value: String(score.gaps), color: "#F87171" },
          { label: "Passed", value: String(score.passed), color: "#4DFFA0" },
          { label: "Partial", value: String(score.partial), color: "#FFB347" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Compliance Score</div>
          <ScoreGauge score={score.overallScore} size={140} />
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Domain Breakdown</div>
          {score.domainScores.slice(0, 7).map((d) => (
            <DomainBar key={d.code} domainCode={d.code} score={d.score} />
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Client Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Contact", value: client.contact_name },
            { label: "Phone", value: client.phone ?? "—" },
            { label: "Target Level", value: `CMMC Level ${client.cmmc_target_level}` },
            { label: "Stage", value: client.engagement_stage },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 14, color: "#E2E8F0", textTransform: "capitalize" }}>{f.value}</div>
            </div>
          ))}
        </div>
        {client.notes && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{client.notes}</div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 40 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: 20 }}>
          Gap Remediation
        </div>
        {gapControls.length === 0 ? (
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14,
              padding: 24,
              fontSize: 14,
              color: "rgba(255,255,255,0.4)",
            }}
          >
            No gaps to remediate — client has no &ldquo;No&rdquo; responses.
          </div>
        ) : (
          <GapRemediationPanel assessmentId={activeAssessment!.id} gaps={gapControls} />
        )}
      </div>

      {/* AI Evidence Review */}
      {aiFeedbackRows.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
            AI Evidence Review
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aiFeedbackRows.map((fb) => {
              const verdictConfig = {
                sufficient: { color: "#4DFFA0", bg: "rgba(77,255,160,0.06)", border: "rgba(77,255,160,0.15)", label: "✓ Sufficient" },
                needs_more: { color: "#FFB347", bg: "rgba(255,179,71,0.06)", border: "rgba(255,179,71,0.15)", label: "⚠ Needs More Evidence" },
                insufficient: { color: "#F87171", bg: "rgba(248,113,113,0.06)", border: "rgba(248,113,113,0.15)", label: "✗ Insufficient" },
              }[fb.verdict as "sufficient" | "needs_more" | "insufficient"] ?? {
                color: "#FFB347", bg: "rgba(255,179,71,0.06)", border: "rgba(255,179,71,0.15)", label: fb.verdict,
              };

              return (
                <div key={fb.control_id} style={{
                  background: verdictConfig.bg,
                  border: `1px solid ${verdictConfig.border}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00C9FF" }}>
                      {fb.control_id}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: verdictConfig.color }}>
                      {verdictConfig.label}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>
                      {new Date(fb.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
                    {fb.feedback}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Evidence Artifacts */}
      <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16 }}>
          Evidence Artifacts
        </div>

        {artifactsWithUrls.length === 0 ? (
          <div style={card}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "24px 0" }}>
              No evidence uploaded yet. Clients can attach evidence files when answering Yes or Partial on controls.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Object.entries(artifactsByControl).map(([controlId, items]) => (
              <div key={controlId} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00C9FF" }}>
                    {controlId}
                  </span>
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
                        <span style={{ fontSize: 18 }}>📎</span>
                        <div>
                          {artifact.signedUrl ? (
                            <a href={artifact.signedUrl} target="_blank" rel="noreferrer" style={{
                              fontSize: 13, color: "#00C9FF", textDecoration: "none", fontWeight: 500,
                            }}>
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
