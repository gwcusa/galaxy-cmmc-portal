"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { CONTROLS, DOMAINS, getDomain } from "@/lib/controls";
import type { ResponseMap } from "@/lib/scoring";

type Response = "yes" | "partial" | "no" | "na";

export default function AssessmentPage() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [approvedGuidance, setApprovedGuidance] = useState<Record<string, string>>({});
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!client) { setLoaded(true); return; }
      setClientId(client.id);

      const res = await fetch(`/api/assessment?clientId=${client.id}`);
      const data = await res.json();

      setAssessmentId(data.assessmentId);
      const responseMap: ResponseMap = {};
      const notesMap: Record<string, string> = {};
      for (const r of data.responses) {
        responseMap[r.control_id] = r.response;
        if (r.notes) notesMap[r.control_id] = r.notes;
      }
      setResponses(responseMap);
      setNotes(notesMap);

      // Fetch approved Galaxy guidance for this assessment
      if (data.assessmentId) {
        const guidanceRes = await fetch(`/api/remediation/client?assessmentId=${data.assessmentId}`);
        if (guidanceRes.ok) {
          const guidanceData = await guidanceRes.json();
          const guidanceMap: Record<string, string> = {};
          for (const n of guidanceData.notes ?? []) {
            guidanceMap[n.control_id] = n.custom_guidance;
          }
          setApprovedGuidance(guidanceMap);
        }
      }

      setLoaded(true);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveResponse = useCallback(async (controlId: string, response: Response, note: string) => {
    if (!assessmentId) return;
    setSaving(true);
    await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, controlId, response, notes: note }),
    });
    setSaving(false);
  }, [assessmentId]);

  const control = CONTROLS[step];
  const domain = getDomain(control.domain_code);
  const progress = (step / CONTROLS.length) * 100;
  const answeredCount = Object.keys(responses).length;
  const currentResponse = responses[control.id];
  const currentNote = notes[control.id] ?? "";

  function handleResponse(val: Response) {
    setResponses((r) => ({ ...r, [control.id]: val }));
    saveResponse(control.id, val, currentNote);
  }

  function handleNote(val: string) {
    setNotes((n) => ({ ...n, [control.id]: val }));
  }

  function handleNoteBlur() {
    if (currentResponse) {
      saveResponse(control.id, currentResponse, currentNote);
    }
  }

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Loading assessment...</div>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>No Client Profile Found</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Contact Galaxy Consulting to set up your account.</div>
      </div>
    );
  }

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Gap Assessment</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            NIST SP 800-171 Rev 2 — 110 Controls · {answeredCount} answered {saving && "· Saving..."}
          </div>
        </div>
        <a href="/portal/dashboard" style={{
          padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF",
          textDecoration: "none",
        }}>
          Save & Exit
        </a>
      </div>

      {/* Progress */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Progress</span>
          <span style={{ fontSize: 12, color: "#00C9FF", fontWeight: 600 }}>
            {step + 1} of {CONTROLS.length} ({Math.round(progress)}%)
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #00C9FF, #4DFFA0)", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {DOMAINS.map((d) => (
            <span key={d.code} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 20, fontWeight: 600,
              background: d.code === control.domain_code ? `${d.color}22` : "rgba(255,255,255,0.04)",
              color: d.code === control.domain_code ? d.color : "rgba(255,255,255,0.3)",
              border: `1px solid ${d.code === control.domain_code ? d.color + "44" : "transparent"}`,
            }}>
              {d.code}
            </span>
          ))}
        </div>
      </div>

      {/* Control Card */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ background: `${domain?.color}22`, border: `1px solid ${domain?.color}44`, borderRadius: 8, padding: "4px 12px", fontSize: 12, color: domain?.color, fontWeight: 600 }}>
            {domain?.name}
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
            {control.id}
          </div>
          <div style={{
            borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600,
            background: control.level === 1 ? "rgba(77,255,160,0.1)" : "rgba(0,201,255,0.1)",
            color: control.level === 1 ? "#4DFFA0" : "#00C9FF",
          }}>
            Level {control.level}
          </div>
        </div>

        <div style={{ fontSize: 16, color: "#fff", lineHeight: 1.6, marginBottom: 28, fontWeight: 500 }}>
          {control.description}
        </div>

        {/* Response buttons */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            Is this control implemented?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { val: "yes" as Response, label: "Yes — Fully Implemented" },
              { val: "partial" as Response, label: "Partial — In Progress" },
              { val: "no" as Response, label: "No — Not Implemented" },
              { val: "na" as Response, label: "N/A" },
            ]).map((opt) => (
              <button key={opt.val} onClick={() => handleResponse(opt.val)} style={{
                flex: 1, padding: "10px 6px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${currentResponse === opt.val ? "rgba(0,201,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                background: currentResponse === opt.val ? "rgba(0,201,255,0.12)" : "rgba(255,255,255,0.03)",
                color: currentResponse === opt.val ? "#00C9FF" : "rgba(255,255,255,0.5)",
                transition: "all 0.15s",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
            Notes / Evidence (optional)
          </div>
          <textarea
            value={currentNote}
            onChange={(e) => handleNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Describe implementation details, link to evidence, or note remediation plans..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: 12, color: "#E2E8F0", fontSize: 13,
              resize: "vertical", minHeight: 80, boxSizing: "border-box",
            }}
          />
        </div>

        {/* Galaxy Recommendation callout (approved guidance only) */}
        {approvedGuidance[control.id] && (
          <div style={{
            marginTop: 16,
            marginBottom: 24,
            background: "rgba(77,255,160,0.06)",
            border: "1px solid rgba(77,255,160,0.2)",
            borderRadius: 10,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, color: "#4DFFA0", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, fontWeight: 600 }}>
              Galaxy Recommendation
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
              {approvedGuidance[control.id]}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "transparent",
              color: step === 0 ? "rgba(255,255,255,0.2)" : "#00C9FF",
              border: `1px solid ${step === 0 ? "rgba(255,255,255,0.1)" : "#00C9FF"}`,
            }}
          >
            Previous
          </button>
          <button
            onClick={() => {
              if (step < CONTROLS.length - 1) setStep((s) => s + 1);
              else window.location.href = "/portal/dashboard";
            }}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", border: "none",
            }}
          >
            {step < CONTROLS.length - 1 ? "Next Control" : "Complete & View Dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
