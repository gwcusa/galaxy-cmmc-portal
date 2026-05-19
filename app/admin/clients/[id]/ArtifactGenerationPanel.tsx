"use client";

import { useEffect, useState } from "react";

type ArtifactType = "ssp" | "poam" | "policy_template";

type GeneratedArtifact = {
  id: string;
  artifact_type: ArtifactType;
  title: string;
  content: string;
  status: "draft" | "finalized";
  generated_at: string;
  updated_at: string;
};

const ARTIFACT_DEFS: { type: ArtifactType; label: string; description: string; icon: string }[] = [
  {
    type: "ssp",
    label: "System Security Plan (SSP)",
    description: "Formal documentation of how your client's organization meets each implemented CMMC control.",
    icon: "📄",
  },
  {
    type: "poam",
    label: "Plan of Action & Milestones",
    description: "Structured remediation plan for all identified gaps with timelines and responsible parties.",
    icon: "📋",
  },
  {
    type: "policy_template",
    label: "Policy & Procedure Templates",
    description: "Ready-to-use policy templates covering the domains with identified compliance gaps.",
    icon: "📜",
  },
];

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

export default function ArtifactGenerationPanel({ assessmentId }: { assessmentId: string }) {
  const [artifacts, setArtifacts] = useState<Record<ArtifactType, GeneratedArtifact | null>>({
    ssp: null, poam: null, policy_template: null,
  });
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<ArtifactType | null>(null);
  const [editMode, setEditMode] = useState<ArtifactType | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState<ArtifactType | null>(null);
  const [activeTab, setActiveTab] = useState<ArtifactType | null>(null);

  useEffect(() => {
    fetch(`/api/admin/artifacts?assessmentId=${assessmentId}`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<ArtifactType, GeneratedArtifact | null> = { ssp: null, poam: null, policy_template: null };
        for (const a of (d.artifacts ?? []) as GeneratedArtifact[]) {
          map[a.artifact_type] = a;
        }
        setArtifacts(map);
        setLoading(false);
        // Auto-open the first existing artifact
        const first = (["ssp", "poam", "policy_template"] as ArtifactType[]).find((t) => map[t] !== null);
        if (first) setActiveTab(first);
      });
  }, [assessmentId]);

  async function generate(type: ArtifactType) {
    setGenerating(type);
    const res = await fetch("/api/admin/artifacts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, artifactType: type }),
    });
    const data = await res.json();
    if (data.content) {
      setArtifacts((prev) => ({
        ...prev,
        [type]: {
          id: data.artifactId,
          artifact_type: type,
          title: ARTIFACT_DEFS.find((a) => a.type === type)!.label,
          content: data.content,
          status: "draft",
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }));
      setActiveTab(type);
    }
    setGenerating(null);
  }

  async function saveEdit(type: ArtifactType) {
    const artifact = artifacts[type];
    if (!artifact) return;
    setSaving(true);
    await fetch("/api/admin/artifacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: artifact.id, content: editContent }),
    });
    setArtifacts((prev) => ({
      ...prev,
      [type]: prev[type] ? { ...prev[type]!, content: editContent, updated_at: new Date().toISOString() } : null,
    }));
    setEditMode(null);
    setSaving(false);
  }

  async function finalize(type: ArtifactType) {
    const artifact = artifacts[type];
    if (!artifact) return;
    setFinalizing(type);
    await fetch("/api/admin/artifacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: artifact.id, status: "finalized" }),
    });
    setArtifacts((prev) => ({
      ...prev,
      [type]: prev[type] ? { ...prev[type]!, status: "finalized" } : null,
    }));
    setFinalizing(null);
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "16px 0" }}>Loading artifacts...</div>;
  }

  const activeArtifact = activeTab ? artifacts[activeTab] : null;
  const activeDef = activeTab ? ARTIFACT_DEFS.find((d) => d.type === activeTab)! : null;

  return (
    <div>
      {/* Artifact cards — selection row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {ARTIFACT_DEFS.map((def) => {
          const artifact = artifacts[def.type];
          const isActive = activeTab === def.type;
          const isGenerating = generating === def.type;
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
              onClick={() => artifact && setActiveTab(def.type)}
            >
              <div style={{ fontSize: 20, marginBottom: 8 }}>{def.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{def.label}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.5, marginBottom: 12 }}>
                {def.description}
              </div>

              {artifact ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: artifact.status === "finalized" ? "#4DFFA0" : "#FFB347",
                  }}>
                    {artifact.status === "finalized" ? "✓ Finalized" : "● Draft"}
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
                  {isGenerating ? "Generating with AI..." : "Generate with AI"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Content viewer/editor */}
      {activeTab && activeArtifact && activeDef && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 2 }}>
                {activeDef.icon} {activeArtifact.title}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
                Generated {new Date(activeArtifact.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {activeArtifact.status === "finalized" && (
                  <span style={{ marginLeft: 10, color: "#4DFFA0", fontWeight: 600 }}>✓ Finalized</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {editMode === activeTab ? (
                <>
                  <button
                    onClick={() => { setEditMode(null); }}
                    style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEdit(activeTab)}
                    disabled={saving}
                    style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: saving ? "not-allowed" : "pointer", background: "rgba(0,201,255,0.12)", border: "1px solid rgba(0,201,255,0.3)", color: "#00C9FF", fontWeight: 600, opacity: saving ? 0.5 : 1 }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  {activeArtifact.status !== "finalized" && (
                    <button
                      onClick={() => { setEditContent(activeArtifact.content); setEditMode(activeTab); }}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
                    >
                      Edit
                    </button>
                  )}
                  {activeArtifact.status === "draft" && (
                    <button
                      onClick={() => finalize(activeTab)}
                      disabled={finalizing === activeTab}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: finalizing === activeTab ? "not-allowed" : "pointer", background: "rgba(77,255,160,0.1)", border: "1px solid rgba(77,255,160,0.3)", color: "#4DFFA0", fontWeight: 600, opacity: finalizing === activeTab ? 0.5 : 1 }}
                    >
                      {finalizing === activeTab ? "Finalizing..." : "Finalize"}
                    </button>
                  )}
                  {activeArtifact.status === "finalized" && (
                    <button
                      onClick={() => finalize(activeTab)}
                      style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)" }}
                    >
                      Revert to Draft
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16 }}>
            {editMode === activeTab ? (
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
                {activeArtifact.content}
              </div>
            )}
          </div>
        </div>
      )}

      {!activeTab && Object.values(artifacts).every((a) => a === null) && (
        <div style={{ ...card, textAlign: "center", padding: 32, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          No artifacts generated yet. Use the buttons above to generate each document with AI.
        </div>
      )}
    </div>
  );
}
