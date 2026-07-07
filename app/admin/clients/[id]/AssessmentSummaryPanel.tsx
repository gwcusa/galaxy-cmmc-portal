type Blocker = { control_id: string; issue: string; impact: string };
type Contradiction = { controls: string[]; description: string };
type DomainNote = { domain_code: string; status: "strong" | "mixed" | "weak"; note: string };

export type AssessmentSummary = {
  overall_verdict: "ready" | "conditional" | "not_ready";
  narrative: string;
  sprs_estimate: number | null;
  poam_eligible: boolean | null;
  domain_rollups: DomainNote[] | null;
  top_blockers: Blocker[] | null;
  contradictions: Contradiction[] | null;
  generated_at: string;
};

const VERDICT_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  ready: { label: "Ready for Assessment", color: "#4DFFA0", bg: "rgba(77,255,160,0.1)" },
  conditional: { label: "Conditional (POA&M Path)", color: "#FFB347", bg: "rgba(255,179,71,0.1)" },
  not_ready: { label: "Not Ready", color: "#F87171", bg: "rgba(248,113,113,0.1)" },
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

export default function AssessmentSummaryPanel({ summary }: { summary: AssessmentSummary }) {
  const verdict = VERDICT_STYLE[summary.overall_verdict] ?? VERDICT_STYLE.not_ready;
  const blockers = summary.top_blockers ?? [];
  const contradictions = summary.contradictions ?? [];
  const domains = summary.domain_rollups ?? [];

  return (
    <div style={{ ...card, marginBottom: 24, border: `1px solid ${verdict.color}33` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Readiness Assessment</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {summary.sprs_estimate !== null && (
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              SPRS {summary.sprs_estimate}/110
            </span>
          )}
          <span style={{
            background: verdict.bg, color: verdict.color, border: `1px solid ${verdict.color}55`,
            borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 700,
          }}>
            {verdict.label}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: blockers.length + contradictions.length + domains.length > 0 ? 20 : 0 }}>
        {summary.narrative}
      </div>

      {blockers.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#F87171", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
            Top Blockers
          </div>
          {blockers.map((b, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
              <span style={{ color: "#F87171", fontWeight: 700, minWidth: 56 }}>{b.control_id}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", flex: 1 }}>
                {b.issue} <span style={{ color: "rgba(255,255,255,0.4)" }}>— {b.impact}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {contradictions.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#FFB347", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
            Inconsistencies to Resolve
          </div>
          {contradictions.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
              <span style={{ color: "#FFB347", fontWeight: 700, minWidth: 110 }}>{(c.controls ?? []).join(", ")}</span>
              <span style={{ color: "rgba(255,255,255,0.7)", flex: 1 }}>{c.description}</span>
            </div>
          ))}
        </div>
      )}

      {domains.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
            Domain Highlights
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {domains.map((d, i) => {
              const color = d.status === "strong" ? "#4DFFA0" : d.status === "weak" ? "#F87171" : "#FFB347";
              return (
                <span key={i} title={d.note} style={{
                  background: `${color}15`, color, border: `1px solid ${color}40`,
                  borderRadius: 8, padding: "5px 12px", fontSize: 12,
                }}>
                  {d.domain_code}: {d.note.length > 70 ? d.note.slice(0, 70) + "…" : d.note}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 16 }}>
        Generated {new Date(summary.generated_at).toLocaleString()} — automated analysis; final determinations rest with the assessor.
      </div>
    </div>
  );
}
