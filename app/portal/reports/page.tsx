"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

interface Client {
  id: string;
  company_name: string;
  cmmc_target_level: number;
  engagement_stage: string;
}

interface Assessment {
  id: string;
  client_id: string;
  status: string;
  total_score: number | null;
  started_at: string | null;
  completed_at: string | null;
  response_count?: number;
}

interface ExistingReport {
  reportId: string;
  signedUrl: string;
  generatedAt: string;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

function StatusBadge({ status }: { status: string }) {
  const isCompleted = status === "completed";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: isCompleted ? "rgba(77,255,160,0.12)" : "rgba(255,179,71,0.12)",
        color: isCompleted ? "#4DFFA0" : "#FFB347",
        border: `1px solid ${isCompleted ? "rgba(77,255,160,0.3)" : "rgba(255,179,71,0.3)"}`,
      }}
    >
      {isCompleted ? "Completed" : "In Progress"}
    </span>
  );
}

export default function ReportsPage() {
  const [clientData, setClientData] = useState<Client | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [existingReport, setExistingReport] = useState<ExistingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportCheckDone, setReportCheckDone] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          window.location.href = "/login";
          return;
        }

        // Fetch client record for this user
        const { data: clientRow, error: clientErr } = await supabase
          .from("clients")
          .select("id, company_name, cmmc_target_level, engagement_stage")
          .eq("user_id", session.user.id)
          .single();

        if (clientErr || !clientRow) {
          setLoading(false);
          return;
        }

        setClientData(clientRow);

        // Fetch most recent assessment for this client
        const { data: assessmentRow, error: assessmentErr } = await supabase
          .from("assessments")
          .select("id, client_id, status, total_score, started_at, completed_at")
          .eq("client_id", clientRow.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .single();

        if (assessmentErr || !assessmentRow) {
          setLoading(false);
          return;
        }

        // Count responses
        const { count } = await supabase
          .from("assessment_responses")
          .select("id", { count: "exact", head: true })
          .eq("assessment_id", assessmentRow.id);

        setAssessment({ ...assessmentRow, response_count: count ?? 0 });

        // Check for existing report
        const res = await fetch(`/api/reports?assessmentId=${assessmentRow.id}`);
        const reportData = await res.json();
        if (res.ok && reportData.reportId) {
          setExistingReport({
            reportId: reportData.reportId,
            signedUrl: reportData.signedUrl,
            generatedAt: reportData.generatedAt,
          });
        }
      } catch (err) {
        console.error("Error loading reports page:", err);
      } finally {
        setLoading(false);
        setReportCheckDone(true);
      }
    }

    load();
  }, []);

  async function handleGenerate() {
    if (!assessment) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessmentId: assessment.id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate report. Please try again.");
        return;
      }

      // Trigger download
      window.open(data.signedUrl, "_blank");

      // Refresh existing report state
      setExistingReport({
        reportId: data.reportId,
        signedUrl: data.signedUrl,
        generatedAt: new Date().toISOString(),
      });
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadAgain() {
    if (!assessment) return;
    setError(null);

    try {
      const res = await fetch(`/api/reports?assessmentId=${assessment.id}`);
      const data = await res.json();

      if (!res.ok || !data.signedUrl) {
        setError("Could not retrieve download link. Please generate a new report.");
        return;
      }

      window.open(data.signedUrl, "_blank");
    } catch {
      setError("An unexpected error occurred. Please try again.");
    }
  }

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          color: "rgba(255,255,255,0.4)",
          fontSize: 14,
        }}
      >
        Loading...
      </div>
    );
  }

  // No assessment state
  if (clientData && !assessment) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div
          style={{
            ...cardStyle,
            textAlign: "center",
            padding: 48,
            maxWidth: 420,
            width: "100%",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
            No assessment started yet
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
            Start your gap assessment to generate a report
          </div>
          <a
            href="/portal/assessment"
            style={{
              display: "inline-block",
              padding: "11px 24px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: "#00C9FF",
              color: "#050B18",
              textDecoration: "none",
            }}
          >
            Start Assessment
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px" }}>
      {/* Page Header */}
      <h1 style={{ fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
        Reports
      </h1>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", marginBottom: 40 }}>
        Generate and download your CMMC compliance gap assessment reports
      </p>

      {/* Assessment Info Card */}
      {assessment && clientData && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ ...labelStyle, marginBottom: 16 }}>Assessment Overview</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 20,
            }}
          >
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Company</div>
              <div style={{ fontSize: 14, color: "#E2E8F0", fontWeight: 500 }}>
                {clientData.company_name}
              </div>
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Status</div>
              <StatusBadge status={assessment.status} />
            </div>
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Responses Answered</div>
              <div style={{ fontSize: 14, color: "#E2E8F0", fontWeight: 500 }}>
                {assessment.response_count ?? 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Report Section */}
      {assessment && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ ...labelStyle, marginBottom: 12 }}>Generate Report</div>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20, lineHeight: 1.6 }}>
            Generate a full PDF report of your CMMC compliance gap assessment, including control scores,
            findings, and recommended remediation steps.
          </p>

          {error && (
            <div
              style={{
                background: "rgba(248,113,113,0.1)",
                border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                color: "#F87171",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "12px 24px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              background: generating ? "rgba(0,201,255,0.3)" : "#00C9FF",
              color: generating ? "rgba(255,255,255,0.5)" : "#050B18",
              border: "none",
              cursor: generating ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {generating ? "Generating report..." : "Generate PDF Report"}
          </button>
        </div>
      )}

      {/* Existing Reports Section */}
      <div style={cardStyle}>
        <div style={{ ...labelStyle, marginBottom: 16 }}>Previous Reports</div>

        {!reportCheckDone ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Checking for reports...</div>
        ) : existingReport ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "14px 18px",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 }}>
                CMMC Gap Assessment Report
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Generated:{" "}
                {new Date(existingReport.generatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <button
              onClick={handleDownloadAgain}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: "transparent",
                color: "#00C9FF",
                border: "1px solid #00C9FF",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Download Again
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
            No reports generated yet.
          </div>
        )}
      </div>
    </div>
  );
}
