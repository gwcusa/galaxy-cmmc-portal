import CollapsibleSection from "@/components/CollapsibleSection";

export type EvidenceArtifact = {
  id: string;
  control_id: string;
  file_name: string;
  file_size: number | null;
  uploaded_at: string;
  artifact_type: "policy" | "implementation" | null;
  signedUrl: string | null;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const TYPE_CONFIG = {
  policy: { label: "Policy", color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.25)" },
  implementation: { label: "Implementation", color: "#00C9FF", bg: "rgba(0,201,255,0.08)", border: "rgba(0,201,255,0.25)" },
  none: { label: "Uncategorized", color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)" },
} as const;

/**
 * The client's uploaded evidence, grouped by control. Shared by the admin and
 * assessor client pages so the two can't drift — the assessor page previously
 * fetched these files and then never rendered them.
 */
export default function EvidenceArtifactsSection({ artifacts }: { artifacts: EvidenceArtifact[] }) {
  const byControl: Record<string, EvidenceArtifact[]> = {};
  for (const a of artifacts) {
    if (!byControl[a.control_id]) byControl[a.control_id] = [];
    byControl[a.control_id].push(a);
  }

  return (
    <CollapsibleSection
      title="Evidence Artifacts"
      subtitle="Files the client uploaded as evidence, grouped by control."
      badge={artifacts.length > 0 ? { text: `${artifacts.length} file${artifacts.length === 1 ? "" : "s"}`, color: "#00C9FF" } : null}
    >
      {artifacts.length === 0 ? (
        <div style={{ ...card, fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 32 }}>
          No evidence uploaded yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(byControl).map(([controlId, items]) => (
            <div key={controlId} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00C9FF" }}>{controlId}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 8px" }}>
                  {items.length} file{items.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((artifact) => {
                  const typeConfig = TYPE_CONFIG[artifact.artifact_type ?? "none"];
                  return (
                    <div key={artifact.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 14px",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16 }}>📎</span>
                        <div>
                          {artifact.signedUrl ? (
                            <a href={artifact.signedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#00C9FF", textDecoration: "none", fontWeight: 500 }}>
                              {artifact.file_name}
                            </a>
                          ) : (
                            <span style={{ fontSize: 13, color: "#E2E8F0" }}>{artifact.file_name}</span>
                          )}
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                            {artifact.file_size ? `${(artifact.file_size / 1024).toFixed(1)} KB · ` : ""}
                            {new Date(artifact.uploaded_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </div>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 12,
                        color: typeConfig.color, background: typeConfig.bg, border: `1px solid ${typeConfig.border}`,
                        flexShrink: 0,
                      }}>
                        {typeConfig.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
