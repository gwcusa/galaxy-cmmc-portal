import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  in_progress:          "#00C9FF",
  submitted:            "#FFB347",
  under_review:         "#A78BFA",
  remediation_required: "#F87171",
  resubmitted:          "#FFB347",
  approved:             "#4DFFA0",
  finalized:            "#4DFFA0",
  archived:             "rgba(255,255,255,0.3)",
};

export default async function AssessorDashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(roleRow?.role ?? "")) redirect("/portal/dashboard");

  // Fetch all clients with their latest active assessment
  const { data: clients } = await svc
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level, engagement_stage, engagement_type")
    .order("company_name");

  const STATUS_PRIORITY = ["under_review", "remediation_required", "submitted", "resubmitted", "approved", "finalized", "in_progress"];

  const clientsWithAssessments = await Promise.all(
    (clients ?? []).map(async (client) => {
      const { data: assessments } = await svc
        .from("assessments")
        .select("id, status, started_at, assigned_to")
        .eq("client_id", client.id)
        .not("status", "eq", "archived")
        .order("started_at", { ascending: false });

      const active =
        STATUS_PRIORITY.map((s) => assessments?.find((a) => a.status === s)).find(Boolean) ??
        assessments?.[0] ?? null;

      return { ...client, assessment: active };
    })
  );

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  };

  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Clients</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Select a client to review their assessment.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {clientsWithAssessments.map((client) => {
          const status = client.assessment?.status ?? null;
          const statusColor = status ? (STATUS_COLOR[status] ?? "#888") : "rgba(255,255,255,0.2)";

          return (
            <Link
              key={client.id}
              href={`/assessor/clients/${client.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="hover-card" style={{
                ...card,
                display: "flex", alignItems: "center", gap: 20, cursor: "pointer",
                transition: "border-color 0.15s",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #A78BFA, #00C9FF)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 700, color: "#050B18",
                }}>
                  {client.company_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{client.company_name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2, display: "flex", gap: 10 }}>
                    <span>{client.contact_name}</span>
                    <span>· CMMC Level {client.cmmc_target_level}</span>
                    <span style={{ color: stageColor[client.engagement_stage] ?? "#888", textTransform: "capitalize" }}>
                      · {client.engagement_stage}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {status ? (
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
                      color: statusColor,
                      background: `${statusColor}18`,
                      border: `1px solid ${statusColor}30`,
                      textTransform: "capitalize",
                    }}>
                      {status.replace(/_/g, " ")}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>No assessment</span>
                  )}
                </div>
                <div style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>›</div>
              </div>
            </Link>
          );
        })}

        {clientsWithAssessments.length === 0 && (
          <div style={{ ...card, textAlign: "center", padding: 48, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
            No clients found.
          </div>
        )}
      </div>
    </div>
  );
}
