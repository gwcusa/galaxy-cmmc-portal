"use client";

import { useState } from "react";

export type ControlReviewItem = {
  controlId: string;
  description: string;
  domain: string;
  domainCode: string;
  domainColor: string;
  clientResponse: string;
  clientNotes: string | null;
  aiVerdict: string | null;
  aiFeedback: string | null;
  aiGeneratedAt: string | null;
  assessorVerdict: string | null;
  assessorNotes: string | null;
  reviewedAt: string | null;
};

const VERDICT_CONFIG = {
  met:           { color: "#4DFFA0", bg: "rgba(77,255,160,0.08)",   border: "rgba(77,255,160,0.25)",   label: "Met" },
  partially_met: { color: "#FFB347", bg: "rgba(255,179,71,0.08)",   border: "rgba(255,179,71,0.25)",   label: "Partially Met" },
  not_met:       { color: "#F87171", bg: "rgba(248,113,113,0.08)",  border: "rgba(248,113,113,0.25)",  label: "Not Met" },
  needs_review:  { color: "#A78BFA", bg: "rgba(167,139,250,0.08)",  border: "rgba(167,139,250,0.25)",  label: "Needs Review" },
} as const;

const RESPONSE_CONFIG: Record<string, { label: string; color: string }> = {
  yes:     { label: "Yes",     color: "#4DFFA0" },
  partial: { label: "Partial", color: "#FFB347" },
  no:      { label: "No",      color: "#F87171" },
  na:      { label: "N/A",     color: "rgba(255,255,255,0.4)" },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const cfg = VERDICT_CONFIG[verdict as keyof typeof VERDICT_CONFIG];
  if (!cfg) return <span style={{ color: "#888", fontSize: 12 }}>{verdict}</span>;
  return (
    <span style={{
      display: "inline-block", padding: "3px 11px", borderRadius: 20,
      fontSize: 12, fontWeight: 700,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

export default function AssessmentReviewPanel({
  assessmentId,
  items: initialItems,
}: {
  assessmentId: string;
  items: ControlReviewItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [editMode, setEditMode] = useState<Record<string, { verdict: string; notes: string } | null>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("all");

  const reviewedCount = items.filter((i) => i.assessorVerdict !== null).length;
  const pendingAiCount = items.filter((i) => i.aiVerdict === null).length;
  const unreviewedCount = items.length - reviewedCount;

  const visibleItems = items.filter((i) => {
    if (filter === "pending") return i.assessorVerdict === null;
    if (filter === "reviewed") return i.assessorVerdict !== null;
    return true;
  });

  async function save(controlId: string, verdict: string, notes: string) {
    setSaving((prev) => ({ ...prev, [controlId]: true }));
    const res = await fetch("/api/admin/determinations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, controlId, assessorVerdict: verdict, assessorNotes: notes }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((prev) =>
        prev.map((item) =>
          item.controlId === controlId
            ? { ...item, assessorVerdict: verdict, assessorNotes: notes, reviewedAt: data.reviewedAt }
            : item
        )
      );
      setEditMode((prev) => ({ ...prev, [controlId]: null }));
    }
    setSaving((prev) => ({ ...prev, [controlId]: false }));
  }

  async function acceptAI(item: ControlReviewItem) {
    if (!item.aiVerdict) return;
    await save(item.controlId, item.aiVerdict, "AI recommendation accepted.");
  }

  async function bulkAcceptAll() {
    const unreviewed = items.filter((i) => i.assessorVerdict === null && i.aiVerdict !== null);
    if (!unreviewed.length) return;
    setBulkSaving(true);
    for (const item of unreviewed) {
      await save(item.controlId, item.aiVerdict!, "AI recommendation accepted.");
    }
    setBulkSaving(false);
  }

  function openEdit(item: ControlReviewItem) {
    setEditMode((prev) => ({
      ...prev,
      [item.controlId]: {
        verdict: item.assessorVerdict ?? item.aiVerdict ?? "not_met",
        notes: item.assessorNotes ?? "",
      },
    }));
  }

  function cancelEdit(controlId: string) {
    setEditMode((prev) => ({ ...prev, [controlId]: null }));
  }

  const innerCard: React.CSSProperties = {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 8,
    padding: "12px 14px",
  };

  return (
    <div>
      {/* Summary + bulk action bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12, marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
            <span style={{ color: "#fff", fontWeight: 700 }}>{reviewedCount}</span>
            {" / "}
            <span style={{ color: "#fff", fontWeight: 700 }}>{items.length}</span>
            {" reviewed"}
          </span>
          {pendingAiCount > 0 && (
            <span style={{ fontSize: 12, color: "#FFB347" }}>
              · {pendingAiCount} awaiting AI
            </span>
          )}
          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["all", "pending", "reviewed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  background: filter === f ? "rgba(255,255,255,0.1)" : "transparent",
                  border: `1px solid ${filter === f ? "rgba(255,255,255,0.2)" : "transparent"}`,
                  color: filter === f ? "#fff" : "rgba(255,255,255,0.4)",
                  textTransform: "capitalize",
                }}
              >
                {f === "pending" ? `Pending (${unreviewedCount})` : f === "reviewed" ? `Reviewed (${reviewedCount})` : "All"}
              </button>
            ))}
          </div>
        </div>
        {unreviewedCount > 0 && (
          <button
            onClick={bulkAcceptAll}
            disabled={bulkSaving}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: "rgba(77,255,160,0.08)", border: "1px solid rgba(77,255,160,0.25)", color: "#4DFFA0",
              opacity: bulkSaving ? 0.5 : 1,
            }}
          >
            {bulkSaving ? "Accepting..." : `Accept All AI Recommendations (${unreviewedCount})`}
          </button>
        )}
      </div>

      {visibleItems.length === 0 && (
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 12, padding: "32px", textAlign: "center",
          fontSize: 13, color: "rgba(255,255,255,0.3)",
        }}>
          {filter === "pending" ? "All controls have been reviewed." : "No controls to display."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visibleItems.map((item) => {
          const isEditing = editMode[item.controlId] != null;
          const edit = editMode[item.controlId];
          const isSaving = saving[item.controlId] ?? false;
          const respCfg = RESPONSE_CONFIG[item.clientResponse] ?? { label: item.clientResponse, color: "#888" };
          const isReviewed = item.assessorVerdict !== null;

          return (
            <div key={item.controlId} style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${isReviewed ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.11)"}`,
              borderRadius: 12,
              padding: 20,
            }}>
              {/* Control identifier */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00C9FF" }}>
                  {item.controlId}
                </span>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                  background: `${item.domainColor}18`, color: item.domainColor,
                  border: `1px solid ${item.domainColor}33`,
                }}>
                  {item.domain}
                </span>
                {isReviewed && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                    Reviewed {new Date(item.reviewedAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 14 }}>
                {item.description}
              </div>

              {/* Client submission + AI analysis side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {/* Client */}
                <div style={innerCard}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
                    Client Submission
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: "2px 9px", borderRadius: 6,
                    color: respCfg.color, background: `${respCfg.color}18`, border: `1px solid ${respCfg.color}33`,
                    display: "inline-block", marginBottom: 8,
                  }}>
                    {respCfg.label}
                  </span>
                  {item.clientNotes ? (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, fontStyle: "italic" }}>
                      &ldquo;{item.clientNotes}&rdquo;
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>No notes provided</div>
                  )}
                </div>

                {/* AI */}
                <div style={innerCard}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>
                    AI Analysis
                  </div>
                  {item.aiVerdict ? (
                    <>
                      <div style={{ marginBottom: 8 }}>
                        <VerdictBadge verdict={item.aiVerdict} />
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                        {item.aiFeedback}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(255,179,71,0.6)", fontStyle: "italic" }}>
                      AI analysis pending...
                    </div>
                  )}
                </div>
              </div>

              {/* Assessor determination */}
              <div style={{
                background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 8, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
                  Assessor Determination
                </div>

                {/* Pending, not editing */}
                {!isReviewed && !isEditing && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
                      Pending review
                    </span>
                    {item.aiVerdict && (
                      <button
                        onClick={() => acceptAI(item)}
                        disabled={isSaving}
                        style={{
                          padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: "rgba(77,255,160,0.08)", border: "1px solid rgba(77,255,160,0.3)", color: "#4DFFA0",
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        {isSaving ? "Saving..." : "Accept AI"}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(item)}
                      style={{
                        padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      Override
                    </button>
                  </div>
                )}

                {/* Reviewed, not editing */}
                {isReviewed && !isEditing && (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ marginBottom: 6 }}>
                        <VerdictBadge verdict={item.assessorVerdict!} />
                        {item.aiVerdict && item.assessorVerdict !== item.aiVerdict && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "#FFB347" }}>
                            (AI: {VERDICT_CONFIG[item.aiVerdict as keyof typeof VERDICT_CONFIG]?.label ?? item.aiVerdict})
                          </span>
                        )}
                      </div>
                      {item.assessorNotes && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
                          {item.assessorNotes}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => openEdit(item)}
                      style={{
                        padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", flexShrink: 0,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)",
                      }}
                    >
                      Modify
                    </button>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && edit && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Determination</div>
                        <select
                          value={edit.verdict}
                          onChange={(e) =>
                            setEditMode((prev) => ({ ...prev, [item.controlId]: { ...prev[item.controlId]!, verdict: e.target.value } }))
                          }
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                            color: "#E2E8F0", outline: "none", cursor: "pointer",
                          }}
                        >
                          <option value="met">Met</option>
                          <option value="partially_met">Partially Met</option>
                          <option value="not_met">Not Met</option>
                          <option value="needs_review">Needs Review</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>Notes (optional)</div>
                        <textarea
                          value={edit.notes}
                          onChange={(e) =>
                            setEditMode((prev) => ({ ...prev, [item.controlId]: { ...prev[item.controlId]!, notes: e.target.value } }))
                          }
                          placeholder="Add justification, observations, or override reasoning..."
                          rows={2}
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: 8, fontSize: 12,
                            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                            color: "#E2E8F0", outline: "none", resize: "vertical",
                            fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => save(item.controlId, edit.verdict, edit.notes)}
                        disabled={isSaving}
                        style={{
                          padding: "7px 20px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer",
                          background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        {isSaving ? "Saving..." : "Save Determination"}
                      </button>
                      <button
                        onClick={() => cancelEdit(item.controlId)}
                        style={{
                          padding: "7px 18px", borderRadius: 7, fontSize: 12, cursor: "pointer",
                          background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
