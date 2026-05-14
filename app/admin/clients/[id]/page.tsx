import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";

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
  if (activeAssessment) {
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", activeAssessment.id);
    if (responseRows) {
      responses = Object.fromEntries(
        responseRows.map((r: { control_id: string; response: string }) => [r.control_id, r.response])
      ) as ResponseMap;
    }
  }

  const score = calculateScore(responses);
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
    </div>
  );
}
