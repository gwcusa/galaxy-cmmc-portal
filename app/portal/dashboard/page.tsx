import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getControlsForLevel } from "@/lib/controls";
import Link from "next/link";
import InfoRequestCard from "./InfoRequestCard";

type AssessmentStatus =
  | "in_progress"
  | "submitted"
  | "under_review"
  | "remediation_required"
  | "resubmitted"
  | "approved"
  | "finalized"
  | "archived";

const STATUS_CONFIG: Record<
  AssessmentStatus,
  { label: string; description: string; color: string; bg: string; border: string; icon: string }
> = {
  in_progress: {
    label: "Assessment In Progress",
    description: "Answer each control question and upload any supporting evidence. Submit when complete.",
    color: "#00C9FF",
    bg: "rgba(0,201,255,0.06)",
    border: "rgba(0,201,255,0.15)",
    icon: "◉",
  },
  submitted: {
    label: "Submitted — Awaiting Review",
    description: "Your assessment has been received. The Galaxy team will begin their review shortly. No action needed.",
    color: "#FFB347",
    bg: "rgba(255,179,71,0.06)",
    border: "rgba(255,179,71,0.15)",
    icon: "⏳",
  },
  under_review: {
    label: "Under Review",
    description: "The Galaxy team is actively reviewing your assessment and evidence. We will be in touch if anything is needed.",
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.06)",
    border: "rgba(167,139,250,0.15)",
    icon: "◎",
  },
  remediation_required: {
    label: "Action Required",
    description: "Galaxy has identified items that need your attention. Review the guidance below and respond to each request.",
    color: "#F87171",
    bg: "rgba(248,113,113,0.06)",
    border: "rgba(248,113,113,0.15)",
    icon: "!",
  },
  resubmitted: {
    label: "Resubmitted — Awaiting Review",
    description: "Your updated submission has been received and is under review.",
    color: "#FFB347",
    bg: "rgba(255,179,71,0.06)",
    border: "rgba(255,179,71,0.15)",
    icon: "⏳",
  },
  approved: {
    label: "Assessment Approved",
    description: "Your assessment has been approved by Galaxy Consulting. Your final deliverables are being prepared.",
    color: "#4DFFA0",
    bg: "rgba(77,255,160,0.06)",
    border: "rgba(77,255,160,0.15)",
    icon: "✓",
  },
  finalized: {
    label: "Finalized",
    description: "Your assessment is complete. Your final report is available for download below.",
    color: "#4DFFA0",
    bg: "rgba(77,255,160,0.06)",
    border: "rgba(77,255,160,0.15)",
    icon: "✓",
  },
  archived: {
    label: "Archived",
    description: "This assessment has been archived. Contact Galaxy Consulting if you have any questions.",
    color: "rgba(255,255,255,0.35)",
    bg: "rgba(255,255,255,0.03)",
    border: "rgba(255,255,255,0.08)",
    icon: "◻",
  },
};

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("id, company_name, cmmc_target_level, engagement_type, assessments(id, status, started_at)")
    .eq("user_id", session.user.id)
    .single();

  const ACTIVE_ORDER: AssessmentStatus[] = [
    "remediation_required", "under_review", "submitted",
    "resubmitted", "in_progress", "approved", "finalized",
  ];

  const assessments = (client?.assessments ?? []) as { id: string; status: string; started_at: string }[];
  const assessment =
    ACTIVE_ORDER.reduce<{ id: string; status: string; started_at: string } | null>((found, s) => {
      if (found) return found;
      return assessments.find((a) => a.status === s) ?? null;
    }, null) ?? assessments[0] ?? null;

  const assessmentStatus = (assessment?.status ?? null) as AssessmentStatus | null;
  const statusConfig = assessmentStatus ? STATUS_CONFIG[assessmentStatus] : null;

  // Count answered controls for progress display
  let answeredCount = 0;
  if (assessment) {
    const { count } = await supabase
      .from("assessment_responses")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessment.id);
    answeredCount = count ?? 0;
  }

  const targetLevel = (client?.cmmc_target_level as 1 | 2) ?? 2;
  const totalControls = getControlsForLevel(targetLevel).length;
  const completionPct = totalControls > 0 ? Math.round((answeredCount / totalControls) * 100) : 0;

  // Fetch approved remediation guidance (visible to client)
  let remediationItems: { control_id: string; custom_guidance: string }[] = [];
  if (assessment) {
    const { data: notes } = await supabase
      .from("remediation_notes")
      .select("control_id, custom_guidance")
      .eq("assessment_id", assessment.id)
      .eq("status", "approved");
    remediationItems = notes ?? [];
  }

  // Fetch open information requests (remediation clients only)
  let infoRequests: { id: string; subject: string; body: string; status: string; requested_at: string; client_response: string | null }[] = [];
  const isRemediation = client?.engagement_type === "remediation";
  if (isRemediation && assessment) {
    const { data: reqs } = await supabase
      .from("information_requests")
      .select("id, subject, body, status, requested_at, client_response")
      .eq("assessment_id", assessment.id)
      .neq("status", "closed")
      .order("requested_at", { ascending: false });
    infoRequests = reqs ?? [];
  }

  const pendingRequests = infoRequests.filter((r) => r.status === "pending");
  const canContinue = assessmentStatus === "in_progress" || !assessment;
  const canDownload = assessmentStatus === "finalized" || assessmentStatus === "approved";

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
            {client?.company_name ?? "Your Portal"}
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            CMMC Level {targetLevel} ·{" "}
            <span style={{ color: isRemediation ? "#4DFFA0" : "#00C9FF" }}>
              {isRemediation ? "Remediation Package" : "Assessment Package"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {canContinue && (
            <Link href="/portal/assessment" style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
              textDecoration: "none",
            }}>
              {assessment ? "Continue Assessment" : "Start Assessment"}
            </Link>
          )}
          {canDownload && (
            <Link href="/portal/reports" style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
              textDecoration: "none",
            }}>
              Download Report
            </Link>
          )}
        </div>
      </div>

      {/* No assessment yet */}
      {!assessment && (
        <div style={{ ...card, textAlign: "center", padding: 56 }}>
          <div style={{ fontSize: 42, marginBottom: 16, opacity: 0.6 }}>📋</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>
            Ready to Begin
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 28, maxWidth: 440, margin: "0 auto 28px" }}>
            Start your CMMC Level {targetLevel} gap assessment. Answer each control question
            and upload any supporting evidence documents.
          </div>
          <Link href="/portal/assessment" style={{
            padding: "13px 32px", borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
            textDecoration: "none", display: "inline-block",
          }}>
            Start Assessment →
          </Link>
        </div>
      )}

      {/* Assessment exists — show status + progress */}
      {assessment && statusConfig && (
        <>
          {/* Status Banner */}
          <div style={{
            background: statusConfig.bg,
            border: `1px solid ${statusConfig.border}`,
            borderRadius: 14,
            padding: "20px 24px",
            marginBottom: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: `${statusConfig.color}22`,
              border: `1px solid ${statusConfig.color}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: statusConfig.color, fontWeight: 700, flexShrink: 0,
            }}>
              {statusConfig.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusConfig.color, marginBottom: 4 }}>
                {statusConfig.label}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                {statusConfig.description}
              </div>
            </div>
          </div>

          {/* Assessment Completion Progress */}
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Assessment Completion</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                {answeredCount} of {totalControls} controls answered
              </div>
            </div>
            <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
              <div style={{
                height: "100%",
                width: `${completionPct}%`,
                background: completionPct === 100
                  ? "linear-gradient(90deg, #00C9FF, #4DFFA0)"
                  : "linear-gradient(90deg, #00C9FF, #A78BFA)",
                borderRadius: 4,
                transition: "width 0.3s ease",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              {completionPct === 100
                ? "All controls answered — ready to submit"
                : `${totalControls - answeredCount} controls remaining`}
            </div>
          </div>

          {/* Remediation guidance — only shown for remediation package clients when notes exist */}
          {isRemediation && remediationItems.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>
                Guidance from Galaxy
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
                The following items have been identified by your assessor. Review each one and upload any requested evidence.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {remediationItems.map((item) => (
                  <div key={item.control_id} style={{
                    background: "rgba(77,255,160,0.04)",
                    border: "1px solid rgba(77,255,160,0.15)",
                    borderRadius: 10,
                    padding: "14px 16px",
                  }}>
                    <div style={{
                      fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                      color: "#00C9FF", marginBottom: 6,
                    }}>
                      {item.control_id}
                    </div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                      {item.custom_guidance}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Information Requests — remediation package only */}
          {isRemediation && infoRequests.length > 0 && (
            <div style={{ ...card, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                  Information Requests from Galaxy
                </div>
                {pendingRequests.length > 0 && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: "#F87171",
                    background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
                    borderRadius: 20, padding: "2px 10px",
                  }}>
                    {pendingRequests.length} need{pendingRequests.length === 1 ? "s" : ""} response
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
                Your assessor has requested additional information. Please respond to each open request.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {infoRequests.map((req) => (
                  <InfoRequestCard key={req.id} req={req} />
                ))}
              </div>
            </div>
          )}

          {/* Continue CTA if still in progress */}
          {canContinue && answeredCount < totalControls && (
            <div style={{ ...card, marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>
                  Continue Your Assessment
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                  {totalControls - answeredCount} control{totalControls - answeredCount !== 1 ? "s" : ""} still need a response.
                </div>
              </div>
              <Link href="/portal/assessment" style={{
                padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
                textDecoration: "none", flexShrink: 0,
              }}>
                Continue →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
