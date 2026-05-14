import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = createServerSupabaseClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level, engagement_stage, assessments(id, total_score, status)")
    .order("created_at", { ascending: false });

  const totalClients = clients?.length ?? 0;
  const activeEngagements = clients?.filter((c) => c.engagement_stage === "active").length ?? 0;
  const completed = clients?.filter((c) => c.engagement_stage === "completed").length ?? 0;
  const scores = clients?.flatMap((c) =>
    (c.assessments as { total_score: number | null; status: string }[])
      ?.filter((a) => a.total_score !== null)
      .map((a) => a.total_score as number) ?? []
  ) ?? [];
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Admin — Client Overview</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Galaxy Consulting, LLC · Internal Management Panel</div>
        </div>
        <Link href="/admin/clients/new" style={{
          padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
          textDecoration: "none",
        }}>
          + Invite Client
        </Link>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Clients", value: String(totalClients), color: "#00C9FF" },
          { label: "Active Engagements", value: String(activeEngagements), color: "#4DFFA0" },
          { label: "Assessments Complete", value: String(completed), color: "#FFB347" },
          { label: "Avg. Score", value: `${avgScore}%`, color: "#F87171" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Client Pipeline */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Client Pipeline</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Company", "Contact", "CMMC Level", "Stage", "Score", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => {
              const assessments = c.assessments as { total_score: number | null; status: string }[];
              const latestScore = assessments?.[0]?.total_score ?? null;
              const color = stageColor[c.engagement_stage] ?? "#888";
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.company_name}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{c.contact_name}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 12, color: "#00C9FF", fontWeight: 600 }}>L{c.cmmc_target_level}</span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}18`, color, fontWeight: 600, textTransform: "capitalize" }}>
                      {c.engagement_stage}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {latestScore !== null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 4, width: 60, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${latestScore}%`, background: latestScore > 70 ? "#4DFFA0" : latestScore > 40 ? "#FFB347" : "#F87171", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{latestScore}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Not started</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <Link href={`/admin/clients/${c.id}`} style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: "rgba(0,201,255,0.1)", color: "#00C9FF",
                      border: "1px solid rgba(0,201,255,0.2)", textDecoration: "none",
                    }}>
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(clients?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            No clients yet. Invite your first client to get started.
          </div>
        )}
      </div>
    </div>
  );
}
