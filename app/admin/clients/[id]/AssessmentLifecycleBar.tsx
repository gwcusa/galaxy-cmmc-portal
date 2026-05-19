"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Transition = {
  status: string;
  label: string;
  color: string;
  bg: string;
  border: string;
};

const TRANSITIONS: Record<string, Transition[]> = {
  submitted: [
    { status: "under_review", label: "Begin Review", color: "#A78BFA", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.35)" },
  ],
  under_review: [
    { status: "approved", label: "Approve Assessment", color: "#4DFFA0", bg: "rgba(77,255,160,0.1)", border: "rgba(77,255,160,0.35)" },
    { status: "remediation_required", label: "Request Remediation", color: "#F87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.35)" },
  ],
  remediation_required: [
    { status: "under_review", label: "Resume Review", color: "#A78BFA", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.35)" },
  ],
  resubmitted: [
    { status: "under_review", label: "Begin Re-Review", color: "#A78BFA", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.35)" },
  ],
  approved: [
    { status: "finalized", label: "Finalize Assessment", color: "#4DFFA0", bg: "rgba(77,255,160,0.1)", border: "rgba(77,255,160,0.35)" },
  ],
};

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  in_progress:          { label: "In Progress",           color: "#00C9FF" },
  submitted:            { label: "Submitted",              color: "#FFB347" },
  under_review:         { label: "Under Review",           color: "#A78BFA" },
  remediation_required: { label: "Remediation Required",   color: "#F87171" },
  resubmitted:          { label: "Resubmitted",            color: "#FFB347" },
  approved:             { label: "Approved",               color: "#4DFFA0" },
  finalized:            { label: "Finalized",              color: "#4DFFA0" },
  archived:             { label: "Archived",               color: "rgba(255,255,255,0.3)" },
};

export default function AssessmentLifecycleBar({
  assessmentId,
  currentStatus,
}: {
  assessmentId: string;
  currentStatus: string;
}) {
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const router = useRouter();

  const transitions = TRANSITIONS[currentStatus] ?? [];
  const showArchive = !["archived", "finalized", "in_progress"].includes(currentStatus);
  const statusDisplay = STATUS_DISPLAY[currentStatus];

  async function transition(newStatus: string) {
    setTransitioning(newStatus);
    await fetch(`/api/admin/assessment/${assessmentId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
    setTransitioning(null);
  }

  if (transitions.length === 0 && !showArchive) return null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: "14px 20px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 24,
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px" }}>
        Status
      </span>
      <span style={{
        fontSize: 13, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
        color: statusDisplay?.color ?? "#888",
        background: `${statusDisplay?.color ?? "#888"}18`,
        border: `1px solid ${statusDisplay?.color ?? "#888"}33`,
      }}>
        {statusDisplay?.label ?? currentStatus.replace(/_/g, " ")}
      </span>

      {transitions.length > 0 && (
        <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.08)", marginLeft: 4 }} />
      )}

      {transitions.map((t) => (
        <button
          key={t.status}
          onClick={() => transition(t.status)}
          disabled={transitioning !== null}
          style={{
            padding: "7px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            cursor: transitioning ? "not-allowed" : "pointer",
            background: t.bg, border: `1px solid ${t.border}`, color: t.color,
            opacity: transitioning !== null ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {transitioning === t.status ? "Updating..." : t.label}
        </button>
      ))}

      {showArchive && (
        <button
          onClick={() => transition("archived")}
          disabled={transitioning !== null}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 11, cursor: "pointer",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.35)", marginLeft: "auto",
            opacity: transitioning ? 0.5 : 1,
          }}
        >
          {transitioning === "archived" ? "Archiving..." : "Archive"}
        </button>
      )}
    </div>
  );
}
