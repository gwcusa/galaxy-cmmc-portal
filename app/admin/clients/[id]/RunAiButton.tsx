"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type RunInfo = {
  id: string;
  status: "running" | "completed" | "failed";
  total_controls: number;
  completed_controls: number;
  failed_controls: number;
  synthesis_done: boolean;
  error: string | null;
};

export default function RunAiButton({ assessmentId }: { assessmentId: string }) {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch(`/api/admin/assessment/${assessmentId}/run-status`);
    if (!res.ok) return;
    const data = await res.json();
    setRun(data.run);
    if (data.run && data.run.status !== "running" && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      router.refresh();
    }
  }, [assessmentId, router]);

  // Show any in-flight run on mount (e.g., triggered by client submission)
  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus]);

  useEffect(() => {
    if (run?.status === "running" && !pollRef.current) {
      pollRef.current = setInterval(fetchStatus, 5000);
    }
  }, [run, fetchStatus]);

  async function handleClick() {
    setStarting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/assessment/${assessmentId}/run-ai`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setMessage(data.message ?? null);
      await fetchStatus();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to start analysis.");
    }
    setStarting(false);
  }

  const running = run?.status === "running";
  const progress = run && run.total_controls > 0
    ? Math.round(((run.completed_controls + run.failed_controls) / run.total_controls) * 100)
    : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        onClick={handleClick}
        disabled={starting || running}
        style={{
          padding: "8px 18px",
          borderRadius: 8,
          background: starting || running ? "rgba(0,201,255,0.2)" : "rgba(0,201,255,0.12)",
          border: "1px solid rgba(0,201,255,0.3)",
          color: starting || running ? "rgba(0,201,255,0.5)" : "#00C9FF",
          fontSize: 13,
          fontWeight: 600,
          cursor: starting || running ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {starting ? "Starting…" : running ? "Analyzing…" : "Run Analysis"}
      </button>

      {running && run && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 160, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${progress}%`, height: "100%", background: "#00C9FF",
              borderRadius: 3, transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
            {run.completed_controls + run.failed_controls}/{run.total_controls} controls
            {progress === 100 ? " — synthesizing…" : ""}
          </span>
        </div>
      )}

      {!running && run?.status === "completed" && (
        <span style={{ fontSize: 12, color: "#4DFFA0" }}>
          Last run: {run.completed_controls}/{run.total_controls} reviewed
          {run.failed_controls > 0 ? `, ${run.failed_controls} failed` : ""}
          {run.synthesis_done ? " · summary ready" : ""}
        </span>
      )}
      {!running && run?.status === "failed" && (
        <span style={{ fontSize: 12, color: "#F87171" }}>
          Run failed{run.error ? `: ${run.error}` : ""}. You can start a new run.
        </span>
      )}
      {message && !running && (
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{message}</span>
      )}
    </div>
  );
}
