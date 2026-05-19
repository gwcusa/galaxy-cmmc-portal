"use client";

import { useEffect, useState } from "react";

type Props = {
  assessmentId: string;
  companyName: string;
  contactName: string;
  cmmcLevel: number;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

export default function ReportDownloadPanel({ assessmentId, companyName, contactName, cmmcLevel }: Props) {
  const [existingReport, setExistingReport] = useState<{ reportId: string; signedUrl: string; generatedAt: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/reports?assessmentId=${assessmentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.reportId) setExistingReport(data);
      })
      .finally(() => setChecking(false));
  }, [assessmentId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to generate report.");
      setGenerating(false);
      return;
    }
    setExistingReport({ reportId: data.reportId, signedUrl: data.signedUrl, generatedAt: new Date().toISOString() });
    window.open(data.signedUrl, "_blank");
    setGenerating(false);
  }

  async function downloadAgain() {
    const res = await fetch(`/api/reports?assessmentId=${assessmentId}`);
    const data = await res.json();
    if (data.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Assessment Report</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20, lineHeight: 1.6 }}>
        Your CMMC Level {cmmcLevel} gap assessment report for {companyName}. Includes all control responses,
        findings, and recommended remediation steps.
      </div>

      {error && (
        <div style={{
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
          borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#F87171", marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {checking ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Checking for existing report...</div>
      ) : existingReport ? (
        <div>
          {/* Existing report row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(77,255,160,0.04)", border: "1px solid rgba(77,255,160,0.15)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 }}>
                CMMC Gap Assessment Report
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                Generated {new Date(existingReport.generatedAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </div>
            </div>
            <button
              onClick={downloadAgain}
              style={{
                padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "transparent", color: "#4DFFA0", border: "1px solid rgba(77,255,160,0.4)",
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              Download
            </button>
          </div>

          {/* Regenerate option */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={generate}
              disabled={generating}
              style={{
                padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.5)", cursor: generating ? "not-allowed" : "pointer",
                opacity: generating ? 0.5 : 1,
              }}
            >
              {generating ? "Generating..." : "Regenerate Report"}
            </button>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              Generates a fresh copy with your latest data
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={generating}
          style={{
            padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: generating ? "rgba(0,201,255,0.2)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
            color: generating ? "rgba(255,255,255,0.5)" : "#050B18",
            border: "none", cursor: generating ? "not-allowed" : "pointer",
          }}
        >
          {generating ? "Generating report..." : "Generate PDF Report"}
        </button>
      )}
    </div>
  );
}
