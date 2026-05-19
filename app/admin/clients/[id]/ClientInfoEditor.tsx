"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  clientId: string;
  engagementType: string;
  engagementStage: string;
};

const selectStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "#E2E8F0",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

export default function ClientInfoEditor({ clientId, engagementType, engagementStage }: Props) {
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState(engagementType);
  const [stage, setStage] = useState(engagementStage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ engagement_type: type, engagement_stage: stage }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to save.");
      setSaving(false);
      return;
    }
    setEditing(false);
    setSaving(false);
    router.refresh();
  }

  function cancel() {
    setType(engagementType);
    setStage(engagementStage);
    setEditing(false);
    setError(null);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{
          marginTop: 16, padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          color: "rgba(255,255,255,0.4)",
        }}
      >
        Edit Client Details
      </button>
    );
  }

  return (
    <div style={{
      marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" }}>
        Edit Client Details
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "1px" }}>Package</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
            <option value="assessment">Assessment Only</option>
            <option value="remediation">Remediation Package</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "1px" }}>Stage</div>
          <select value={stage} onChange={(e) => setStage(e.target.value)} style={selectStyle}>
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: "7px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
              background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.3)", color: "#00C9FF",
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
      {error && (
        <div style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{error}</div>
      )}
    </div>
  );
}
