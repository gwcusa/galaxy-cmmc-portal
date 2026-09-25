"use client";

import { useState } from "react";

export default function StartCycleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/start-cycle", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "license_inactive" ? "Your license is not active."
            : data.error === "unlimited_required" ? "Only the Unlimited package lets you start a new cycle."
            : data.error ?? "Could not start a new assessment."
        );
        setLoading(false);
        return;
      }
      window.location.href = "/portal/assessment";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button onClick={start} disabled={loading} style={{
        padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        background: loading ? "rgba(0,201,255,0.3)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
        color: loading ? "rgba(255,255,255,0.5)" : "#050B18", border: "none", whiteSpace: "nowrap",
      }}>
        {loading ? "Starting…" : "Start new assessment →"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#F87171" }}>{error}</span>}
    </div>
  );
}
