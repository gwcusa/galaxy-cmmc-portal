"use client";

import { useState, useEffect } from "react";

type Assessor = { id: string; email: string; name: string };

export default function AssignAssessorSelect({
  assessmentId,
  assignedTo,
}: {
  assessmentId: string;
  assignedTo: string | null;
}) {
  const [assessors, setAssessors] = useState<Assessor[]>([]);
  const [current, setCurrent] = useState<string>(assignedTo ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/assessors")
      .then((r) => (r.ok ? r.json() : { assessors: [] }))
      .then((d) => setAssessors(d.assessors ?? []));
  }, []);

  async function assign(assessorId: string) {
    setSaving(true);
    const res = await fetch(`/api/admin/assessment/${assessmentId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessorId: assessorId || null }),
    });
    if (res.ok) setCurrent(assessorId);
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px" }}>
        Assessor
      </span>
      <select
        value={current}
        disabled={saving}
        onChange={(e) => assign(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, padding: "6px 10px", color: "#E2E8F0", fontSize: 12, outline: "none",
          opacity: saving ? 0.6 : 1,
        }}
      >
        <option value="" style={{ background: "#0A1428" }}>Unassigned</option>
        {assessors.map((a) => (
          <option key={a.id} value={a.id} style={{ background: "#0A1428" }}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
