import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { DOMAINS } from "@/lib/controls";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // Get client record
  const { data: client } = await supabase
    .from("clients")
    .select("*, assessments(id, status, started_at)")
    .eq("user_id", session.user.id)
    .single();

  // Get active assessment responses
  let responses: ResponseMap = {};
  let assessment = null;
  if (client?.assessments?.length) {
    assessment = client.assessments.find((a: { status: string }) => a.status === "in_progress") || client.assessments[0];
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", assessment.id);

    if (responseRows) {
      responses = Object.fromEntries(
        responseRows.map((r: { control_id: string; response: string }) => [r.control_id, r.response])
      ) as ResponseMap;
    }
  }

  // Fetch approved remediation notes for current assessment
  let remediationMap: Record<string, string> = {};
  if (assessment) {
    const { data: remediationNotes } = await supabase
      .from("remediation_notes")
      .select("control_id, custom_guidance")
      .eq("assessment_id", assessment.id)
      .eq("status", "approved");

    if (remediationNotes) {
      remediationMap = Object.fromEntries(
        remediationNotes.map((n: { control_id: string; custom_guidance: string }) => [n.control_id, n.custom_guidance])
      );
    }
  }

  const score = calculateScore(responses, (client?.cmmc_target_level as 1 | 2) ?? 2);

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const label = { fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6 };

  const severityColor: Record<string, string> = { Critical: "#F87171", High: "#FB923C", Medium: "#FBBF24" };
  const severityBg: Record<string, string> = { Critical: "rgba(248,113,113,0.1)", High: "rgba(251,146,60,0.1)", Medium: "rgba(251,191,36,0.1)" };

  function getSeverity(domainCode: string): "Critical" | "High" | "Medium" {
    if (["IR", "CA"].includes(domainCode)) return "Critical";
    if (["RA", "AU", "AT"].includes(domainCode)) return "High";
    return "Medium";
  }

  const gaps = score.criticalGaps.slice(0, 6).map((c) => ({
    id: c.id,
    domain: c.domain,
    domainCode: c.domain_code,
    severity: getSeverity(c.domain_code),
    description: c.description,
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Compliance Dashboard</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {client?.company_name || "Your Company"} — CMMC Level {client?.cmmc_target_level || 2} Assessment
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/portal/assessment" style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF",
            textDecoration: "none",
          }}>
            {assessment ? "Continue Assessment" : "Start Assessment"}
          </Link>
          <Link href="/portal/reports" style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
            textDecoration: "none",
          }}>
            Download Report
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Overall Score", value: `${score.overallScore}%`, sub: `${score.rawScore} of ${score.maxScore} points`, color: score.overallScore >= 70 ? "#4DFFA0" : score.overallScore >= 40 ? "#FFB347" : "#F87171" },
          { label: "Gaps Identified", value: String(score.gaps), sub: `${score.criticalGaps.length} critical priority`, color: "#F87171" },
          { label: "Controls Passed", value: String(score.passed), sub: "fully compliant", color: "#4DFFA0" },
          { label: "Partial Controls", value: String(score.partial), sub: "remediation needed", color: "#FFB347" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={label}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Score + Domain Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Overall Compliance Score</div>
          <ScoreGauge score={score.overallScore} size={140} />
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{
              display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              color: "#FB923C", background: "rgba(251,146,60,0.1)",
            }}>
              {score.overallScore >= 70 ? "✓ On Track" : "⚠ Remediation Needed"}
            </span>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
              Score below 70% requires remediation before C3PAO audit
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Domain Breakdown</div>
          {score.domainScores.slice(0, 7).map((d) => (
            <DomainBar key={d.code} domainCode={d.code} score={d.score} />
          ))}
        </div>
      </div>

      {/* Priority Gaps */}
      {gaps.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Priority Gaps</div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{gaps.length} items require attention</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Control ID", "Domain", "Severity", "Description", "Galaxy Recommendation"].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map((g, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 0", fontSize: 12, fontWeight: 600, color: "#00C9FF", fontFamily: "monospace" }}>{g.id}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{g.domain}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: severityColor[g.severity], background: severityBg[g.severity] }}>
                      {g.severity}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0", fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 400 }}>{g.description}</td>
                  <td style={{ padding: "12px 0 12px 8px" }}>
                    {remediationMap[g.id] ? (
                      <div style={{
                        background: "rgba(77,255,160,0.06)",
                        border: "1px solid rgba(77,255,160,0.15)",
                        borderRadius: 6,
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.5,
                        maxWidth: 320,
                      }}>
                        {remediationMap[g.id]}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
                        Pending Galaxy review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No assessment yet */}
      {!assessment && (
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 8 }}>No Assessment Started</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>Begin your CMMC gap assessment to see compliance scores and recommendations.</div>
          <Link href="/portal/assessment" style={{
            padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
            textDecoration: "none", display: "inline-block",
          }}>
            Start Gap Assessment →
          </Link>
        </div>
      )}
    </div>
  );
}
