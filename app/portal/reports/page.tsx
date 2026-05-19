import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ReportDownloadPanel from "./ReportDownloadPanel";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  in_progress:          { label: "In Progress",          color: "#00C9FF", bg: "rgba(0,201,255,0.08)",    border: "rgba(0,201,255,0.2)"    },
  submitted:            { label: "Submitted",             color: "#FFB347", bg: "rgba(255,179,71,0.08)",   border: "rgba(255,179,71,0.2)"   },
  under_review:         { label: "Under Review",          color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)"  },
  remediation_required: { label: "Remediation Required",  color: "#F87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.2)"  },
  resubmitted:          { label: "Resubmitted",           color: "#FFB347", bg: "rgba(255,179,71,0.08)",   border: "rgba(255,179,71,0.2)"   },
  approved:             { label: "Approved",              color: "#4DFFA0", bg: "rgba(77,255,160,0.08)",   border: "rgba(77,255,160,0.2)"   },
  finalized:            { label: "Finalized",             color: "#4DFFA0", bg: "rgba(77,255,160,0.08)",   border: "rgba(77,255,160,0.2)"   },
  archived:             { label: "Archived",              color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)" },
};

export default async function ReportsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level")
    .eq("user_id", session.user.id)
    .single();

  let assessment: { id: string; status: string; started_at: string; completed_at: string | null } | null = null;

  if (client) {
    const ACTIVE_ORDER = ["approved", "finalized", "under_review", "remediation_required", "submitted", "resubmitted", "in_progress"];
    const { data: rows } = await supabase
      .from("assessments")
      .select("id, status, started_at, completed_at")
      .eq("client_id", client.id)
      .not("status", "eq", "archived")
      .order("started_at", { ascending: false });

    assessment =
      ACTIVE_ORDER
        .map((s) => rows?.find((a) => a.status === s))
        .find(Boolean) ?? rows?.[0] ?? null;
  }

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  };

  const canDownload = assessment?.status === "approved" || assessment?.status === "finalized";
  const statusCfg = assessment ? (STATUS_CONFIG[assessment.status] ?? STATUS_CONFIG.in_progress) : null;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Reports</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Download your CMMC assessment report once it has been approved.
        </div>
      </div>

      {/* No client */}
      {!client && (
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            No client profile found. Contact Galaxy Consulting to set up your account.
          </div>
        </div>
      )}

      {/* No assessment */}
      {client && !assessment && (
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 8 }}>No Assessment Started</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
            Complete your gap assessment before a report can be generated.
          </div>
          <a href="/portal/assessment" style={{
            display: "inline-block", padding: "11px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", textDecoration: "none",
          }}>
            Start Assessment
          </a>
        </div>
      )}

      {/* Assessment exists */}
      {client && assessment && statusCfg && (
        <>
          {/* Assessment status card */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 12 }}>
              Assessment Status
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <span style={{
                  display: "inline-block", padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700,
                  color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.border}`,
                }}>
                  {statusCfg.label}
                </span>
                {assessment.started_at && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
                    Started {new Date(assessment.started_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    {assessment.completed_at && ` · Completed ${new Date(assessment.completed_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                {client.company_name} · CMMC Level {client.cmmc_target_level}
              </div>
            </div>
          </div>

          {/* Not yet approved — explain why report isn't available */}
          {!canDownload && (
            <div style={{
              ...card, marginBottom: 20,
              background: "rgba(167,139,250,0.04)",
              border: "1px solid rgba(167,139,250,0.15)",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#A78BFA", marginBottom: 8 }}>
                Report Not Yet Available
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                Your assessment report will be available for download once Galaxy Consulting has completed
                their review and approved your assessment. Current status:{" "}
                <span style={{ color: statusCfg.color, fontWeight: 600 }}>{statusCfg.label}</span>.
              </div>
            </div>
          )}

          {/* Report download panel — only when approved/finalized */}
          {canDownload && (
            <ReportDownloadPanel
              assessmentId={assessment.id}
              companyName={client.company_name}
              contactName={client.contact_name}
              cmmcLevel={client.cmmc_target_level}
            />
          )}
        </>
      )}
    </div>
  );
}
