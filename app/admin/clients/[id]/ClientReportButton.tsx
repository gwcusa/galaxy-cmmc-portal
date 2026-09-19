"use client";

import { useState } from "react";

export default function ClientReportButton({ assessmentId }: { assessmentId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);

    // Try to reuse an existing report first
    const existing = await fetch(`/api/reports?assessmentId=${assessmentId}`).then((r) => r.json());
    if (existing.signedUrl) {
      window.open(existing.signedUrl, "_blank");
      setLoading(false);
      return;
    }

    // No report yet — generate one
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to generate report.");
      setLoading(false);
      return;
    }
    window.open(data.signedUrl, "_blank");
    setLoading(false);
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        onClick={download}
        disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
          fontSize: 12, fontWeight: 600, textDecoration: "none", cursor: loading ? "not-allowed" : "pointer",
          background: "rgba(77,255,160,0.1)", border: "1px solid rgba(77,255,160,0.25)",
          color: "#4DFFA0", opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Loading…" : "⬇ Client Report (PDF)"}
      </button>
      {error && <span style={{ fontSize: 11, color: "#F87171" }}>{error}</span>}
    </div>
  );
}
