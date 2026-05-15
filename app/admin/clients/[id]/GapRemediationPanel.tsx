"use client";

import { useEffect, useState } from "react";

type Gap = {
  id: string;
  domain: string;
  domain_code: string;
  description: string;
  guidance: string;
};

type NoteStatus = "approved" | "draft" | "not_reviewed";

type NoteState = {
  customGuidance: string;
  status: NoteStatus;
  loading: boolean;
  error: string | null;
};

type Props = {
  assessmentId: string;
  gaps: Gap[];
};

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255,255,255,0.4)",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  resize: "vertical",
  fontFamily: "inherit",
  lineHeight: 1.6,
  minHeight: 90,
};

function statusBadge(status: NoteStatus) {
  const styles: Record<NoteStatus, { color: string; label: string; dot: string }> = {
    approved: { color: "#4DFFA0", label: "Approved", dot: "●" },
    draft: { color: "#FFB347", label: "Draft", dot: "●" },
    not_reviewed: { color: "rgba(255,255,255,0.3)", label: "Not Reviewed", dot: "○" },
  };
  const s = styles[status];
  return (
    <span
      style={{
        fontSize: 12,
        color: s.color,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 10 }}>{s.dot}</span>
      {s.label}
    </span>
  );
}

export default function GapRemediationPanel({ assessmentId, gaps }: Props) {
  const [notes, setNotes] = useState<Record<string, NoteState>>({});

  // Initialize state from props
  useEffect(() => {
    const initial: Record<string, NoteState> = {};
    for (const gap of gaps) {
      initial[gap.id] = {
        customGuidance: gap.guidance,
        status: "not_reviewed",
        loading: false,
        error: null,
      };
    }
    setNotes(initial);
  }, [gaps]);

  // Load existing notes from server
  useEffect(() => {
    if (!assessmentId) return;
    fetch(`/api/remediation?assessmentId=${assessmentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.notes) return;
        setNotes((prev) => {
          const updated = { ...prev };
          for (const note of data.notes as {
            control_id: string;
            custom_guidance: string;
            status: string;
          }[]) {
            if (updated[note.control_id]) {
              updated[note.control_id] = {
                ...updated[note.control_id],
                customGuidance: note.custom_guidance,
                status: (note.status === "approved" ? "approved" : "draft") as NoteStatus,
              };
            }
          }
          return updated;
        });
      })
      .catch(() => {
        // silently fail — notes will show defaults
      });
  }, [assessmentId]);

  async function handleAction(controlId: string, action: "save" | "approve") {
    setNotes((prev) => ({
      ...prev,
      [controlId]: { ...prev[controlId], loading: true },
    }));

    try {
      const res = await fetch("/api/remediation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentId,
          controlId,
          customGuidance: notes[controlId]?.customGuidance ?? "",
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotes((prev) => ({
          ...prev,
          [controlId]: {
            ...prev[controlId],
            status: data.status as NoteStatus,
            loading: false,
            error: null,
          },
        }));
      } else {
        setNotes((prev) => ({
          ...prev,
          [controlId]: { ...prev[controlId], loading: false, error: data.error || "Failed to save. Try again." },
        }));
      }
    } catch {
      setNotes((prev) => ({
        ...prev,
        [controlId]: { ...prev[controlId], loading: false, error: "Network error. Please try again." },
      }));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {gaps.map((gap) => {
        const note = notes[gap.id];
        if (!note) return null;
        return (
          <div key={gap.id} style={card}>
            {/* Header row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 12,
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#00C9FF",
                      letterSpacing: "0.5px",
                    }}
                  >
                    [{gap.id}]
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      padding: "2px 8px",
                    }}
                  >
                    {gap.domain}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#E2E8F0", lineHeight: 1.5 }}>{gap.description}</div>
              </div>
              <div style={{ flexShrink: 0 }}>{statusBadge(note.status)}</div>
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginBottom: 14 }} />

            {/* Guidance textarea */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...labelStyle, marginBottom: 6 }}>Galaxy Guidance</div>
              <textarea
                style={inputStyle}
                value={note.customGuidance}
                onChange={(e) =>
                  setNotes((prev) => ({
                    ...prev,
                    [gap.id]: { ...prev[gap.id], customGuidance: e.target.value },
                  }))
                }
                disabled={note.loading}
                rows={4}
              />
            </div>

            {/* Error message */}
            {note.error && (
              <div style={{ fontSize: 12, color: "#F87171", marginBottom: 10, padding: "6px 10px", background: "rgba(248,113,113,0.1)", borderRadius: 6, border: "1px solid rgba(248,113,113,0.2)" }}>
                {note.error}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => handleAction(gap.id, "save")}
                disabled={note.loading}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#E2E8F0",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: note.loading ? "not-allowed" : "pointer",
                  opacity: note.loading ? 0.5 : 1,
                  transition: "background 0.15s",
                }}
              >
                {note.loading ? "Saving…" : "Save Draft"}
              </button>
              <button
                onClick={() => handleAction(gap.id, "approve")}
                disabled={note.loading}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(77,255,160,0.3)",
                  background: note.status === "approved" ? "rgba(77,255,160,0.15)" : "rgba(77,255,160,0.08)",
                  color: "#4DFFA0",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: note.loading ? "not-allowed" : "pointer",
                  opacity: note.loading ? 0.5 : 1,
                  transition: "background 0.15s",
                }}
              >
                {note.loading ? "Saving…" : "Approve ✓"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
