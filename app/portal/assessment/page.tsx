"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { getControlsForLevel, getDomainsForLevel, getDomain } from "@/lib/controls";
import type { ResponseMap } from "@/lib/scoring";

type Response = "yes" | "partial" | "no" | "na";

type ArtifactItem = {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  signedUrl: string;
};

export default function AssessmentPage() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noArtifacts, setNoArtifacts] = useState<Record<string, boolean>>({});
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("in_progress");
  const [clientId, setClientId] = useState<string | null>(null);
  const [targetLevel, setTargetLevel] = useState<1 | 2>(2);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [approvedGuidance, setApprovedGuidance] = useState<Record<string, string>>({});
  const [artifacts, setArtifacts] = useState<Record<string, ArtifactItem[]>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: client } = await supabase
        .from("clients")
        .select("id, cmmc_target_level")
        .eq("user_id", session.user.id)
        .single();

      if (!client) { setLoaded(true); return; }
      setClientId(client.id);
      setTargetLevel((client.cmmc_target_level as 1 | 2) ?? 2);

      const res = await fetch(`/api/assessment?clientId=${client.id}`);
      const data = await res.json();

      setAssessmentId(data.assessmentId);
      setAssessmentStatus(data.assessmentStatus ?? "in_progress");
      const responseMap: ResponseMap = {};
      const notesMap: Record<string, string> = {};
      const noArtifactsMap: Record<string, boolean> = {};
      for (const r of data.responses) {
        responseMap[r.control_id] = r.response;
        if (r.notes) notesMap[r.control_id] = r.notes;
        if (r.no_artifacts) noArtifactsMap[r.control_id] = true;
      }
      setResponses(responseMap);
      setNotes(notesMap);
      setNoArtifacts(noArtifactsMap);

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

  const saveResponse = useCallback(async (
    controlId: string,
    response: Response,
    note: string,
    noArt: boolean,
  ) => {
    if (!assessmentId) return;
    setSaving(true);
    await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessmentId,
        controlId,
        response,
        notes: note,
        no_artifacts: noArt,
      }),
    });
    setSaving(false);
  }, [assessmentId]);

  const controls = getControlsForLevel(targetLevel);
  const domains = getDomainsForLevel(targetLevel);
  const control = controls[step] ?? controls[0];
  const domain = getDomain(control?.domain_code ?? "");
  const progress = controls.length > 0 ? (step / controls.length) * 100 : 0;
  const answeredCount = Object.keys(responses).length;
  const currentResponse = responses[control?.id ?? ""];
  const currentNote = notes[control?.id ?? ""] ?? "";
  const currentNoArtifacts = noArtifacts[control?.id ?? ""] ?? false;
  const currentArtifacts = artifacts[control?.id ?? ""] ?? [];
  const needsEvidence = currentResponse === "yes" || currentResponse === "partial";
  const evidenceSatisfied = needsEvidence ? (currentArtifacts.length > 0 || currentNoArtifacts) : true;

  function handleResponse(val: Response) {
    setArtifactError(false);
    setResponses((r) => ({ ...r, [control.id]: val }));
    const noArt = noArtifacts[control.id] ?? false;
    saveResponse(control.id, val, currentNote, noArt);
    // Load artifacts when switching to yes/partial
    if ((val === "yes" || val === "partial") && !artifacts[control.id]) {
      loadArtifacts(control.id);
    }
  }

  function handleNote(val: string) {
    setNotes((n) => ({ ...n, [control.id]: val }));
  }

  function handleNoteBlur() {
    if (currentResponse) {
      saveResponse(control.id, currentResponse, currentNote, currentNoArtifacts);
    }
  }

  function handleNoArtifactsToggle(checked: boolean) {
    setNoArtifacts((n) => ({ ...n, [control.id]: checked }));
    if (checked) setArtifactError(false);
    if (currentResponse) {
      saveResponse(control.id, currentResponse, currentNote, checked);
    }
  }

  // Load artifacts when step changes for yes/partial controls
  useEffect(() => {
    if (!assessmentId || !control) return;
    const resp = responses[control.id];
    if (resp !== "yes" && resp !== "partial") return;
    loadArtifacts(control.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, assessmentId, responses[control?.id ?? ""]]);

  async function loadArtifacts(controlId: string) {
    if (!assessmentId) return;
    const res = await fetch(`/api/artifacts?assessmentId=${assessmentId}&controlId=${controlId}`);
    if (res.ok) {
      const data = await res.json();
      setArtifacts((prev) => ({ ...prev, [controlId]: data.artifacts }));
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !assessmentId || !control) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("assessmentId", assessmentId);
    form.append("controlId", control.id);
    form.append("file", file);
    const res = await fetch("/api/artifacts", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      setArtifacts((prev) => ({
        ...prev,
        [control.id]: [...(prev[control.id] ?? []), data.artifact],
      }));
      setArtifactError(false);
      // Clear "no artifacts" if they upload something
      if (currentNoArtifacts) {
        setNoArtifacts((n) => ({ ...n, [control.id]: false }));
        if (currentResponse) saveResponse(control.id, currentResponse, currentNote, false);
      }
    } else {
      setUploadError(data.error ?? "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(artifactId: string, controlId: string) {
    const res = await fetch(`/api/artifacts?artifactId=${artifactId}`, { method: "DELETE" });
    if (res.ok) {
      setArtifacts((prev) => ({
        ...prev,
        [controlId]: (prev[controlId] ?? []).filter((a) => a.id !== artifactId),
      }));
    }
  }

  function handleNext() {
    if (needsEvidence && !evidenceSatisfied) {
      setArtifactError(true);
      return;
    }
    setArtifactError(false);
    setSubmitError(null);
    setStep((s) => s + 1);
  }

  async function handleSubmit() {
    if (needsEvidence && !evidenceSatisfied) {
      setArtifactError(true);
      return;
    }
    if (!assessmentId) return;
    setSaving(true);
    setSubmitError(null);
    const res = await fetch("/api/assessment/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      if (data.missingArtifacts) {
        setSubmitError(`Evidence required for ${data.missingArtifacts.length} control(s): ${data.missingArtifacts.slice(0, 5).join(", ")}${data.missingArtifacts.length > 5 ? "…" : ""}. Please go back and upload artifacts or select "No artifacts available" for each.`);
      } else {
        setSubmitError(data.error ?? "Submission failed");
      }
      return;
    }
    window.location.href = "/portal/dashboard";
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

  const isResubmission = assessmentStatus === "remediation_required";
  if (assessmentStatus !== "in_progress" && !isResubmission) {
    const statusLabel: Record<string, string> = {
      submitted: "Submitted — Awaiting Review",
      under_review: "Under Review",
      resubmitted: "Resubmitted — Awaiting Review",
      approved: "Approved",
      finalized: "Finalized",
      archived: "Archived",
    };
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 36, opacity: 0.5 }}>✓</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
          Assessment {statusLabel[assessmentStatus] ?? assessmentStatus.replace(/_/g, " ")}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 420 }}>
          Your assessment has been submitted and is no longer editable.
          Return to your dashboard to check the status.
        </div>
        <a href="/portal/dashboard" style={{
          marginTop: 8, padding: "11px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
          textDecoration: "none",
        }}>
          Go to Dashboard
        </a>
      </div>
    );
  }

  const card: React.CSSProperties = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      {/* Remediation required banner */}
      {isResubmission && (
        <div style={{
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: 12, padding: "14px 20px", marginBottom: 20,
          display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>!</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F87171", marginBottom: 4 }}>
              Action Required — Remediation Requested
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
              Your assessor has identified items that need attention. Review the Galaxy Recommendations on
              each relevant control, update your responses and notes, then resubmit when ready.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Gap Assessment</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            NIST SP 800-171 Rev 2 — {controls.length} Controls · {answeredCount} answered {saving && "· Saving..."}
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
            {step + 1} of {controls.length} ({Math.round(progress)}%)
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #00C9FF, #4DFFA0)", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {domains.map((d) => (
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
        <div style={{ marginBottom: needsEvidence ? 20 : 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
            Notes / Implementation Details
            {needsEvidence && <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> (optional)</span>}
          </div>
          <textarea
            value={currentNote}
            onChange={(e) => handleNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Describe how this control is implemented, what systems are in use, or any relevant context..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: 12, color: "#E2E8F0", fontSize: 13,
              resize: "vertical", minHeight: 80, boxSizing: "border-box",
            }}
          />
        </div>

        {/* Evidence / Artifacts — required for yes/partial */}
        {needsEvidence && (
          <div style={{
            marginBottom: 24,
            background: artifactError ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.02)",
            border: `1px solid ${artifactError ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 10,
            padding: 16,
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: artifactError ? "#F87171" : "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>
                Evidence Required
              </div>
              <span style={{ fontSize: 11, color: "#F87171", fontWeight: 700 }}>*</span>
              {evidenceSatisfied && (
                <span style={{ fontSize: 11, color: "#4DFFA0", marginLeft: 4 }}>✓ Provided</span>
              )}
            </div>

            {/* CMMC Guidance */}
            {control.guidance && (
              <div style={{
                marginBottom: 14, padding: "10px 14px",
                background: "rgba(0,201,255,0.04)", border: "1px solid rgba(0,201,255,0.12)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 10, color: "#00C9FF", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, fontWeight: 600 }}>
                  What your evidence should demonstrate
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                  {control.guidance}
                </div>
              </div>
            )}

            {/* Uploaded artifacts */}
            {currentArtifacts.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {currentArtifacts.map((artifact) => (
                  <div key={artifact.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "rgba(77,255,160,0.04)", border: "1px solid rgba(77,255,160,0.15)",
                    borderRadius: 8, padding: "10px 14px", marginBottom: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ fontSize: 16 }}>📎</span>
                      <div style={{ minWidth: 0 }}>
                        <a
                          href={artifact.signedUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: 13, color: "#4DFFA0", textDecoration: "none", fontWeight: 500,
                            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {artifact.file_name}
                        </a>
                        {artifact.file_size && (
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                            {(artifact.file_size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(artifact.id, control.id)}
                      style={{
                        background: "none", border: "none", color: "rgba(248,113,113,0.6)",
                        cursor: "pointer", fontSize: 18, padding: "0 4px", flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{uploadError}</div>
            )}

            {/* Upload button — only show if no_artifacts not checked */}
            {!currentNoArtifacts && (
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                border: "1px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)",
                color: uploading ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
                cursor: uploading ? "not-allowed" : "pointer", marginBottom: 6,
              }}>
                <span>{uploading ? "Uploading..." : "+ Attach Evidence"}</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
                  onChange={handleUpload}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
            )}
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 14 }}>
              PDF, PNG, JPG, DOCX, XLSX, TXT · Max 10MB
            </div>

            {/* Divider */}
            {currentArtifacts.length === 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>or</span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
              </div>
            )}

            {/* No artifacts checkbox */}
            {currentArtifacts.length === 0 && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={currentNoArtifacts}
                  onChange={(e) => handleNoArtifactsToggle(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "#F87171", width: 15, height: 15, flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, color: currentNoArtifacts ? "#F87171" : "rgba(255,255,255,0.5)", fontWeight: currentNoArtifacts ? 600 : 400 }}>
                    No artifacts available for this control
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2, lineHeight: 1.5 }}>
                    Check this only if you are genuinely unable to provide supporting evidence. Your assessor will review this declaration.
                  </div>
                </div>
              </label>
            )}

            {/* Validation error */}
            {artifactError && (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                fontSize: 12, color: "#F87171",
              }}>
                Please attach at least one piece of evidence, or check &ldquo;No artifacts available&rdquo; to proceed.
              </div>
            )}
          </div>
        )}

        {/* Galaxy Recommendation callout (approved guidance only) */}
        {approvedGuidance[control.id] && (
          <div style={{
            marginBottom: 24, background: "rgba(77,255,160,0.06)",
            border: "1px solid rgba(77,255,160,0.2)", borderRadius: 10, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 11, color: "#4DFFA0", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, fontWeight: 600 }}>
              Galaxy Recommendation
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
              {approvedGuidance[control.id]}
            </div>
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div style={{
            marginBottom: 16, padding: "12px 14px", borderRadius: 8,
            background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
            fontSize: 13, color: "#F87171", lineHeight: 1.5,
          }}>
            {submitError}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={() => { setArtifactError(false); setStep((s) => Math.max(0, s - 1)); }}
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
            onClick={step < controls.length - 1 ? handleNext : handleSubmit}
            disabled={saving}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: saving ? "rgba(0,201,255,0.3)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
              color: saving ? "rgba(255,255,255,0.5)" : "#050B18", border: "none",
            }}
          >
            {saving ? "Saving..." : step < controls.length - 1
              ? "Next Control"
              : isResubmission
                ? "Resubmit Assessment"
                : "Complete & View Dashboard"
            }
          </button>
        </div>
      </div>
    </div>
  );
}
