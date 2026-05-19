"use client";

import { useState } from "react";

export default function RunAiButton({ assessmentId }: { assessmentId: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/assessment/${assessmentId}/run-ai`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setStatus("done");
      setMessage(data.message ?? `Queued ${data.queued} control(s).`);
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to queue analysis.");
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        style={{
          padding: "8px 18px",
          borderRadius: 8,
          background: status === "loading" ? "rgba(0,201,255,0.2)" : "rgba(0,201,255,0.12)",
          border: "1px solid rgba(0,201,255,0.3)",
          color: status === "loading" ? "rgba(0,201,255,0.5)" : "#00C9FF",
          fontSize: 13,
          fontWeight: 600,
          cursor: status === "loading" ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {status === "loading" ? "Queuing…" : "Run Analysis"}
      </button>
      {message && (
        <span style={{
          fontSize: 12,
          color: status === "error" ? "#F87171" : "#4DFFA0",
        }}>
          {message}
          {status === "done" && " Refresh the page in ~1–2 min to see results."}
        </span>
      )}
    </div>
  );
}
