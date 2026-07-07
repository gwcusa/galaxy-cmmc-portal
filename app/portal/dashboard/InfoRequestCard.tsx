"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type IntakeQuestion = { id: string; question: string; hint?: string };

type InfoReq = {
  id: string;
  subject: string;
  body: string;
  status: string;
  requested_at: string;
  client_response: string | null;
  request_type?: string | null;
  questions?: IntakeQuestion[] | null;
  answers?: Record<string, string> | null;
};

const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit",
  resize: "vertical", outline: "none", boxSizing: "border-box",
};

export default function InfoRequestCard({ req }: { req: InfoReq }) {
  const [expanded, setExpanded] = useState(req.status === "pending");
  const [response, setResponse] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  const isPending = req.status === "pending";
  const isResponded = req.status === "responded";
  const questions = req.request_type === "ai_intake" ? (req.questions ?? []) : [];
  const isStructured = questions.length > 0;

  const canSubmit = isStructured
    ? questions.some((q) => (answers[q.id] ?? "").trim())
    : response.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await fetch(`/api/info-requests/${req.id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isStructured ? { answers } : { response }),
    });
    if (res.ok) {
      setSubmitted(true);
      router.refresh();
    }
    setSubmitting(false);
  }

  return (
    <div style={{
      background: isPending ? "rgba(248,113,113,0.04)" : isResponded ? "rgba(77,255,160,0.03)" : "rgba(255,255,255,0.03)",
      border: isPending ? "1px solid rgba(248,113,113,0.18)" : isResponded ? "1px solid rgba(77,255,160,0.15)" : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10,
      padding: "14px 16px",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{req.subject}</span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: isPending ? "#F87171" : isResponded ? "#4DFFA0" : "rgba(255,255,255,0.4)",
            }}>
              {isPending ? "● Awaiting Your Response" : isResponded ? "✓ Responded" : "Closed"}
            </span>
            {isStructured && (
              <span style={{ fontSize: 11, color: "#00C9FF" }}>
                {questions.length} quick question{questions.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
            {new Date(req.requested_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginLeft: 12 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, marginBottom: isPending ? 16 : 0, whiteSpace: "pre-wrap" }}>
            {req.body}
          </div>

          {isResponded && req.client_response && (
            <>
              <div style={{ fontSize: 11, color: "#4DFFA0", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, marginTop: 14 }}>
                Your Response
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {req.client_response}
              </div>
            </>
          )}

          {isPending && !submitted && isStructured && (
            <div>
              {questions.map((q, i) => (
                <div key={q.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 }}>
                    {i + 1}. {q.question}
                  </div>
                  {q.hint && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>{q.hint}</div>
                  )}
                  <textarea
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    rows={2}
                    style={{ ...textareaStyle, minHeight: 48 }}
                  />
                </div>
              ))}
            </div>
          )}

          {isPending && !submitted && !isStructured && (
            <>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
                Your Response
              </div>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Type your response here..."
                rows={4}
                style={{ ...textareaStyle, minHeight: 90 }}
              />
            </>
          )}

          {isPending && !submitted && (
            <button
              onClick={submit}
              disabled={submitting || !canSubmit}
              style={{
                marginTop: 10, padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.3)", color: "#00C9FF",
                cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
                opacity: submitting || !canSubmit ? 0.5 : 1,
              }}
            >
              {submitting ? "Submitting..." : isStructured ? "Submit Answers" : "Submit Response"}
            </button>
          )}

          {submitted && (
            <div style={{ fontSize: 13, color: "#4DFFA0", fontWeight: 600, marginTop: 10 }}>
              Response submitted successfully.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
