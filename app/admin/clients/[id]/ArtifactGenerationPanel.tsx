"use client";

import { useEffect, useState, useCallback } from "react";

type ArtifactType = "ssp" | "poam" | "policy_template" | "config_baseline";
type ArtifactStatus = "draft" | "finalized" | "published";

type GeneratedArtifact = {
  id: string;
  artifact_type: ArtifactType;
  control_id: string | null;
  version: number;
  title: string;
  content: string;
  status: ArtifactStatus;
  generated_at: string;
  updated_at: string;
};

type GapOption = { id: string; description: string };

const CORE_DEFS: { type: Exclude<ArtifactType, "config_baseline">; label: string; description: string; icon: string }[] = [
  {
    type: "ssp",
    label: "System Security Plan (SSP)",
    description: "Full SSP with per-control implementation statements, generated family by family from the client's evidence, scoping, and intake answers.",
    icon: "📄",
  },
  {
    type: "poam",
    label: "Plan of Action & Milestones",
    description: "Remediation plan for all gaps, prioritized by DoD point value, with timelines and responsible parties.",
    icon: "📋",
  },
  {
    type: "policy_template",
    label: "Policy & Procedure Templates",
    description: "Policies covering the domains with identified gaps, referencing the client's actual tooling.",
    icon: "📜",
  },
];

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const STATUS_BADGE: Record<ArtifactStatus, { label: string; color: string }> = {
  draft: { label: "● Draft", color: "#FFB347" },
  finalized: { label: "✓ Finalized", color: "#4DFFA0" },
  published: { label: "⬆ Published to Client", color: "#00C9FF" },
};

export default function ArtifactGenerationPanel({
  assessmentId,
  gaps = [],
}: {
  assessmentId: string;
  gaps?: GapOption[];
}) {
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // type or `config:${controlId}`
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [configControl, setConfigControl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/artifacts?assessmentId=${assessmentId}`);
    if (res.ok) {
      const data = await res.json();
      setArtifacts(data.artifacts ?? []);
    }
    setLoading(false);
  }, [assessmentId]);

  useEffect(() => { load(); }, [load]);

  const coreArtifact = (type: ArtifactType) =>
    artifacts.find((a) => a.artifact_type === type && a.control_id === null) ?? null;
  const configArtifacts = artifacts.filter((a) => a.artifact_type === "config_baseline");
  const active = artifacts.find((a) => a.id === activeId) ?? null;

  async function generate(type: ArtifactType, controlId?: string) {
    const key = controlId ? `config:${controlId}` : type;
    setGenerating(key);
    setError(null);
    const res = await fetch("/api/admin/artifacts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, artifactType: type, controlId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Generation failed");
    } else {
      await load();
      if (data.artifactId) setActiveId(data.artifactId);
    }
    setGenerating(null);
  }

  async function saveEdit() {
    if (!active) return;
    setSaving(true);
    await fetch("/api/admin/artifacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, content: editContent }),
    });
    await load();
    setEditing(false);
    setSaving(false);
  }

  async function setStatus(status: ArtifactStatus) {
    if (!active) return;
    setStatusBusy(true);
    await fetch("/api/admin/artifacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: active.id, status }),
    });
    await load();
    setStatusBusy(false);
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Loading artifacts...</div>;
  }

  return (
    <div>
      {error && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* Core document cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
        {CORE_DEFS.map((def) => {
          const artifact = coreArtifact(def.type);
          const isGenerating = generating === def.type;
          const isActive = active?.id === artifact?.id && artifact !== null;
          return (
            <div
              key={def.type}
              style={{
                background: isActive ? "rgba(0,201,255,0.06)" : "rgba(255,255,255,0.03)",
                border: isActive ? "1px solid rgba(0,201,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                padding: "16px 18px",
                cursor: artifact ? "pointer" : "default",
              }}
              onClick={() => artifact && setActiveId(artifact.id)}
            >
              <div style={{ fontSize: 20, marginBottom: 8 }}>{def.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{def.label}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginBottom: 12 }}>
                {def.description}
              </div>

              {artifact ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_BADGE[artifact.status].color }}>
                    {STATUS_BADGE[artifact.status].label} · v{artifact.version}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); generate(def.type); }}
                    disabled={isGenerating}
                    style={{
                      padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: isGenerating ? "not-allowed" : "pointer",
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.4)", opacity: isGenerating ? 0.5 : 1,
                    }}
                  >
                    {isGenerating ? "Generating..." : "Regenerate"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => generate(def.type)}
                  disabled={isGenerating}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: isGenerating ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.12)",
                    border: "1px solid rgba(167,139,250,0.3)", color: "#A78BFA",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                    opacity: isGenerating ? 0.7 : 1,
                  }}
                >
                  {isGenerating ? "Generating (may take a minute)..." : "Generate Draft"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Configuration baselines — per gap control */}
      <div style={{ ...card, padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>⚙ Configuration Baselines</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
              Step-by-step configuration guides for a specific gap, targeted at the client&apos;s stack.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={configControl}
              onChange={(e) => setConfigControl(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8, padding: "7px 10px", color: "#E2E8F0", fontSize: 12, outline: "none",
                maxWidth: 320,
              }}
            >
              <option value="">Select gap control…</option>
              {gaps.map((g) => (
                <option key={g.id} value={g.id} style={{ background: "#0A1428" }}>
                  {g.id} — {g.description.slice(0, 60)}
                </option>
              ))}
            </select>
            <button
              onClick={() => configControl && generate("config_baseline", configControl)}
              disabled={!configControl || generating === `config:${configControl}`}
              style={{
                padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", color: "#A78BFA",
                cursor: !configControl ? "not-allowed" : "pointer", opacity: !configControl ? 0.5 : 1,
              }}
            >
              {generating?.startsWith("config:") ? "Generating..." : "Generate Guide"}
            </button>
          </div>
        </div>

        {configArtifacts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {configArtifacts.map((a) => (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                style={{
                  background: active?.id === a.id ? "rgba(0,201,255,0.1)" : "rgba(255,255,255,0.04)",
                  border: active?.id === a.id ? "1px solid rgba(0,201,255,0.3)" : "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer",
                  color: STATUS_BADGE[a.status].color,
                }}
              >
                {a.control_id} · v{a.version}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content viewer/editor */}
      {active && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{active.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                v{active.version} · updated {new Date(active.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                <span style={{ marginLeft: 10, color: STATUS_BADGE[active.status].color, fontWeight: 600 }}>
                  {STATUS_BADGE[active.status].label}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.3)", color: "#00C9FF", fontWeight: 600, opacity: saving ? 0.5 : 1 }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={`/api/artifacts-export/${active.id}`}
                    style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, textDecoration: "none", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                  >
                    ⬇ Export DOCX
                  </a>
                  {active.status !== "published" && (
                    <button
                      onClick={() => { setEditContent(active.content); setEditing(true); }}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                    >
                      Edit
                    </button>
                  )}
                  {active.status === "draft" && (
                    <button
                      onClick={() => setStatus("finalized")}
                      disabled={statusBusy}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(77,255,160,0.1)", border: "1px solid rgba(77,255,160,0.3)", color: "#4DFFA0", fontWeight: 600, opacity: statusBusy ? 0.5 : 1 }}
                    >
                      Finalize
                    </button>
                  )}
                  {active.status === "finalized" && (
                    <>
                      <button
                        onClick={() => setStatus("published")}
                        disabled={statusBusy}
                        style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF", fontWeight: 700, opacity: statusBusy ? 0.5 : 1 }}
                      >
                        Publish to Client
                      </button>
                      <button
                        onClick={() => setStatus("draft")}
                        disabled={statusBusy}
                        style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                      >
                        Revert to Draft
                      </button>
                    </>
                  )}
                  {active.status === "published" && (
                    <button
                      onClick={() => setStatus("finalized")}
                      disabled={statusBusy}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                    >
                      Unpublish
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                style={{
                  width: "100%", minHeight: 480, padding: "14px", borderRadius: 8,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#E2E8F0", fontSize: 13, lineHeight: 1.7, fontFamily: "inherit",
                  resize: "vertical", outline: "none", boxSizing: "border-box",
                }}
              />
            ) : (
              <div style={{
                fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.8,
                whiteSpace: "pre-wrap", maxHeight: 560, overflowY: "auto",
                padding: "0 4px",
              }}>
                {active.content}
              </div>
            )}
          </div>
        </div>
      )}

      {!active && artifacts.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No artifacts generated yet. Use the buttons above to generate each document.
        </div>
      )}
    </div>
  );
}
