"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { SCOPING_QUESTIONS } from "@/lib/scoping-questions";

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#E2E8F0",
  fontSize: 14,
  outline: "none",
};

export default function ScopingPage() {
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [editable, setEditable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!client) { setLoaded(true); return; }

      const res = await fetch(`/api/assessment?clientId=${client.id}`);
      const data = await res.json();
      if (!data.assessmentId) { setLoaded(true); return; }
      setAssessmentId(data.assessmentId);
      setEditable(["in_progress", "remediation_required"].includes(data.assessmentStatus ?? "in_progress"));

      const scopingRes = await fetch(`/api/scoping?assessmentId=${data.assessmentId}`);
      if (scopingRes.ok) {
        const scoping = await scopingRes.json();
        setAnswers(scoping.answers ?? {});
      }
      setLoaded(true);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!assessmentId) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/scoping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, answers }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Save failed");
    } else {
      setSavedAt(new Date().toLocaleTimeString());
    }
    setSaving(false);
  }

  if (!loaded) return <div style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</div>;
  if (!assessmentId) {
    return (
      <div style={{ ...card, color: "rgba(255,255,255,0.5)" }}>
        No assessment has been started yet. Your scoping profile becomes available once your
        engagement begins.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Environment Scoping</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, lineHeight: 1.6 }}>
        Tell us about your environment before answering the control questionnaire. This context makes
        the assessment far more accurate — for example, if you have no wireless networks, wireless
        controls may not apply to you.
      </div>

      <div style={card}>
        {SCOPING_QUESTIONS.map((q) => (
          <div key={q.id} style={{ marginBottom: 22 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 6 }}>
              {q.label}
            </label>
            {q.help && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>{q.help}</div>
            )}
            {q.type === "textarea" && (
              <textarea
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder={q.placeholder}
                disabled={!editable}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            )}
            {q.type === "text" && (
              <input
                type="text"
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder={q.placeholder}
                disabled={!editable}
                style={inputStyle}
              />
            )}
            {q.type === "select" && (
              <select
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                disabled={!editable}
                style={{ ...inputStyle, appearance: "none" }}
              >
                <option value="">Select…</option>
                {q.options?.map((o) => (
                  <option key={o} value={o} style={{ background: "#0A1428" }}>{o}</option>
                ))}
              </select>
            )}
            {q.type === "boolean" && (
              <div style={{ display: "flex", gap: 10 }}>
                {[true, false].map((val) => (
                  <button
                    key={String(val)}
                    onClick={() => editable && setAnswers((a) => ({ ...a, [q.id]: val }))}
                    style={{
                      padding: "8px 24px",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: editable ? "pointer" : "default",
                      border: answers[q.id] === val ? "1px solid #00C9FF" : "1px solid rgba(255,255,255,0.12)",
                      background: answers[q.id] === val ? "rgba(0,201,255,0.15)" : "rgba(255,255,255,0.04)",
                      color: answers[q.id] === val ? "#00C9FF" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {val ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {editable ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: saving ? "rgba(0,201,255,0.3)" : "#00C9FF",
                color: "#050B18",
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                borderRadius: 8,
                padding: "10px 28px",
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save Scoping Profile"}
            </button>
            {savedAt && <span style={{ fontSize: 12, color: "#4DFFA0" }}>Saved at {savedAt}</span>}
            {error && <span style={{ fontSize: 12, color: "#F87171" }}>{error}</span>}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Your assessment has been submitted — scoping is read-only until it reopens.
          </div>
        )}
      </div>
    </div>
  );
}
