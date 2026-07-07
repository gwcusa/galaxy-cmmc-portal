"use client";

import { useState, useEffect, useCallback } from "react";

type GapItem = {
  id: string;
  description: string;
  verdict: string; // client response or AI verdict driving the gap
};

type IntakeRequest = {
  id: string;
  control_id: string | null;
  status: string;
  request_type: string;
  subject: string;
  answers: Record<string, string> | null;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

export default function IntakeQuestionsPanel({
  assessmentId,
  gaps,
}: {
  assessmentId: string;
  gaps: GapItem[];
}) {
  const [requests, setRequests] = useState<IntakeRequest[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/info-requests?assessmentId=${assessmentId}`);
    if (res.ok) {
      const data = await res.json();
      setRequests((data.requests ?? []).filter((r: IntakeRequest) => r.request_type === "ai_intake"));
    }
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);

  async function generate(controlId: string) {
    setGenerating(controlId);
    setError(null);
    const res = await fetch("/api/admin/intake/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, controlId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to generate questions");
    }
    await load();
    setGenerating(null);
  }

  const requestByControl = new Map(
    requests.filter((r) => r.control_id).map((r) => [r.control_id as string, r])
  );

  if (gaps.length === 0) {
    return (
      <div style={{ ...card, fontSize: 14, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 32 }}>
        No gaps needing client input.
      </div>
    );
  }

  return (
    <div style={card}>
      {error && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {gaps.map((gap, i) => {
        const existing = requestByControl.get(gap.id);
        return (
          <div
            key={gap.id}
            style={{
              display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
              borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F87171", minWidth: 56 }}>{gap.id}</span>
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", flex: 1, lineHeight: 1.5 }}>
              {gap.description.length > 110 ? gap.description.slice(0, 110) + "…" : gap.description}
              <span style={{ color: "rgba(255,255,255,0.3)" }}> · {gap.verdict.replace(/_/g, " ")}</span>
            </span>

            {existing ? (
              <span style={{
                fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                color: existing.status === "responded" ? "#4DFFA0" : existing.status === "pending" ? "#FFB347" : "rgba(255,255,255,0.4)",
              }}>
                {existing.status === "responded" ? "✓ Answers received" : existing.status === "pending" ? "● Sent — awaiting answers" : "Closed"}
              </span>
            ) : (
              <button
                onClick={() => generate(gap.id)}
                disabled={generating !== null}
                style={{
                  background: "rgba(0,201,255,0.12)", color: "#00C9FF", border: "1px solid rgba(0,201,255,0.3)",
                  borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600,
                  cursor: generating !== null ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  opacity: generating !== null && generating !== gap.id ? 0.4 : 1,
                }}
              >
                {generating === gap.id ? "Generating…" : "Ask Client"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
