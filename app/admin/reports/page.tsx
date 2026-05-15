import { createServerSupabaseClient } from "@/lib/supabase-server";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { DOMAINS } from "@/lib/controls";

export default async function AdminReportsPage() {
  const supabase = createServerSupabaseClient();

  // Fetch all clients
  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level, engagement_stage, created_at")
    .order("created_at", { ascending: false });

  // Fetch all assessments
  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, client_id, status, total_score, started_at, completed_at")
    .order("started_at", { ascending: false });

  // Fetch all assessment responses
  const { data: allResponses } = await supabase
    .from("assessment_responses")
    .select("id, assessment_id, control_id, response, notes, updated_at");

  // Fetch total reports count
  const { count: reportsCount } = await supabase
    .from("reports")
    .select("id", { count: "exact", head: true });

  const clientList = clients ?? [];
  const assessmentList = assessments ?? [];
  const responseList = allResponses ?? [];

  // Build a map: assessmentId -> ResponseMap
  const responsesByAssessment: Record<string, ResponseMap> = {};
  for (const r of responseList) {
    if (!responsesByAssessment[r.assessment_id]) {
      responsesByAssessment[r.assessment_id] = {};
    }
    responsesByAssessment[r.assessment_id][r.control_id] = r.response as "yes" | "partial" | "no" | "na";
  }

  // Find the latest assessment per client
  const latestAssessmentByClient: Record<string, typeof assessmentList[0]> = {};
  for (const a of assessmentList) {
    if (!latestAssessmentByClient[a.client_id]) {
      latestAssessmentByClient[a.client_id] = a;
    }
  }

  // Build client rows with scores
  type ClientRow = {
    id: string;
    company_name: string;
    contact_name: string;
    engagement_stage: string;
    score: number | null;
    started_at: string | null;
  };

  const clientRows: ClientRow[] = clientList.map((c) => {
    const assessment = latestAssessmentByClient[c.id];
    if (!assessment) {
      return { id: c.id, company_name: c.company_name, contact_name: c.contact_name, engagement_stage: c.engagement_stage, score: null, started_at: null };
    }
    const responses = responsesByAssessment[assessment.id] ?? {};
    const hasResponses = Object.keys(responses).length > 0;
    if (!hasResponses) {
      return { id: c.id, company_name: c.company_name, contact_name: c.contact_name, engagement_stage: c.engagement_stage, score: null, started_at: assessment.started_at };
    }
    const scored = calculateScore(responses);
    return { id: c.id, company_name: c.company_name, contact_name: c.contact_name, engagement_stage: c.engagement_stage, score: scored.overallScore, started_at: assessment.started_at };
  });

  // Sort by score descending, nulls last
  clientRows.sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });

  // Summary stats
  const totalClients = clientList.length;
  const assessmentsWithResponses = assessmentList.filter((a) => {
    const resp = responsesByAssessment[a.id];
    return resp && Object.keys(resp).length > 0;
  });
  const totalAssessmentsStarted = assessmentsWithResponses.length;

  const clientsWithScores = clientRows.filter((r) => r.score !== null);
  const avgScore = clientsWithScores.length > 0
    ? Math.round(clientsWithScores.reduce((sum, r) => sum + (r.score ?? 0), 0) / clientsWithScores.length)
    : 0;

  const totalReports = reportsCount ?? 0;

  // Score distribution
  const compliant = clientsWithScores.filter((r) => (r.score ?? 0) >= 70).length;
  const partial = clientsWithScores.filter((r) => (r.score ?? 0) >= 40 && (r.score ?? 0) < 70).length;
  const critical = clientsWithScores.filter((r) => (r.score ?? 0) < 40).length;

  // Domain gap analysis: count "no" per domain_code across all assessments
  // We need controls to map control_id -> domain_code
  // Import CONTROLS for mapping
  const { CONTROLS } = await import("@/lib/controls");
  const controlDomainMap: Record<string, string> = {};
  for (const ctrl of CONTROLS) {
    controlDomainMap[ctrl.id] = ctrl.domain_code;
  }

  const domainGaps: Record<string, number> = {};
  for (const r of responseList) {
    if (r.response === "no") {
      const domainCode = controlDomainMap[r.control_id];
      if (domainCode) {
        domainGaps[domainCode] = (domainGaps[domainCode] ?? 0) + 1;
      }
    }
  }

  // Build sorted domain gap list, top 7
  const domainGapList = DOMAINS.map((d) => ({
    code: d.code,
    name: d.name,
    color: d.color,
    gaps: domainGaps[d.code] ?? 0,
  }))
    .sort((a, b) => b.gaps - a.gaps)
    .slice(0, 7);

  const maxGaps = domainGapList[0]?.gaps ?? 1;

  // Helpers
  const card = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  } as const;

  const label = {
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
  };

  const stageColor: Record<string, string> = {
    lead: "#FFB347",
    active: "#00C9FF",
    completed: "#4DFFA0",
  };

  function scoreColor(score: number | null): string {
    if (score === null) return "rgba(255,255,255,0.3)";
    if (score >= 70) return "#4DFFA0";
    if (score >= 40) return "#FFB347";
    return "#F87171";
  }

  function scoreStatus(score: number | null): string {
    if (score === null) return "Not Started";
    if (score >= 70) return "Compliant";
    if (score >= 40) return "Partial";
    return "Critical Gap";
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Analytics</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Cross-client CMMC compliance intelligence
        </div>
      </div>

      {/* Summary Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {/* Total Clients */}
        <div style={card}>
          <div style={label}>Total Clients</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", marginTop: 8, lineHeight: 1 }}>{totalClients}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>registered</div>
        </div>

        {/* Assessments Started */}
        <div style={card}>
          <div style={label}>Assessments Started</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#00C9FF", marginTop: 8, lineHeight: 1 }}>{totalAssessmentsStarted}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>with responses</div>
        </div>

        {/* Average Score */}
        <div style={card}>
          <div style={label}>Average Score</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: scoreColor(avgScore), marginTop: 8, lineHeight: 1 }}>
            {clientsWithScores.length > 0 ? `${avgScore}%` : "—"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>across all clients</div>
        </div>

        {/* Reports Generated */}
        <div style={card}>
          <div style={label}>Reports Generated</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: "#4DFFA0", marginTop: 8, lineHeight: 1 }}>{totalReports}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6 }}>total PDFs</div>
        </div>
      </div>

      {/* Score Distribution */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 14 }}>Score Distribution</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div style={{ ...card, borderColor: "rgba(77,255,160,0.2)" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#4DFFA0", lineHeight: 1 }}>{compliant}</div>
            <div style={{ fontSize: 13, color: "#4DFFA0", fontWeight: 600, marginTop: 8 }}>≥70% — Compliant</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              {clientsWithScores.length > 0 ? `${Math.round((compliant / clientsWithScores.length) * 100)}% of assessed` : "no data"}
            </div>
          </div>
          <div style={{ ...card, borderColor: "rgba(255,179,71,0.2)" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#FFB347", lineHeight: 1 }}>{partial}</div>
            <div style={{ fontSize: 13, color: "#FFB347", fontWeight: 600, marginTop: 8 }}>40–69% — Partial</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              {clientsWithScores.length > 0 ? `${Math.round((partial / clientsWithScores.length) * 100)}% of assessed` : "no data"}
            </div>
          </div>
          <div style={{ ...card, borderColor: "rgba(248,113,113,0.2)" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#F87171", lineHeight: 1 }}>{critical}</div>
            <div style={{ fontSize: 13, color: "#F87171", fontWeight: 600, marginTop: 8 }}>&lt;40% — Critical Gap</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>
              {clientsWithScores.length > 0 ? `${Math.round((critical / clientsWithScores.length) * 100)}% of assessed` : "no data"}
            </div>
          </div>
        </div>
      </div>

      {/* Domain Weakness Analysis */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 14 }}>Domain Weakness Analysis</div>
        <div style={card}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>
            Top 7 domains by number of "No" responses across all client assessments
          </div>
          {domainGapList.every((d) => d.gaps === 0) ? (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "24px 0" }}>
              No gap data available yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {domainGapList.map((d) => (
                <div key={d.code} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 180, fontSize: 12, color: "rgba(255,255,255,0.7)", flexShrink: 0 }}>
                    <span style={{ color: d.color, fontWeight: 600 }}>{d.code}</span>{" "}
                    <span>{d.name}</span>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.05)", borderRadius: 4, height: 10, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${maxGaps > 0 ? Math.round((d.gaps / maxGaps) * 100) : 0}%`,
                        background: d.color,
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 32, fontSize: 12, fontWeight: 700, color: d.color, textAlign: "right", flexShrink: 0 }}>
                    {d.gaps}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Client Readiness Table */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 14 }}>Client Readiness</div>
        <div style={card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Company", "Contact", "Stage", "Score %", "Status", "Last Activity"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      fontWeight: 600,
                      letterSpacing: "1px",
                      textTransform: "uppercase",
                      padding: "0 0 12px",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientRows.map((row) => {
                const color = stageColor[row.engagement_stage] ?? "#888";
                const sc = scoreColor(row.score);
                const status = scoreStatus(row.score);
                return (
                  <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 600, color: "#fff" }}>
                      {row.company_name}
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                      {row.contact_name}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: `${color}18`,
                          color,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {row.engagement_stage}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: 15, fontWeight: 700, color: sc }}>
                      {row.score !== null ? `${row.score}%` : "—"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: `${sc}18`,
                          color: sc,
                          fontWeight: 600,
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 0", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                      {formatDate(row.started_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {clientRows.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
              No clients yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
