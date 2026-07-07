import { createServerSupabaseClient } from "@/lib/supabase-server";

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const TYPE_ICONS: Record<string, string> = {
  ssp: "📄",
  poam: "📋",
  policy_template: "📜",
  config_baseline: "⚙",
};

// Published compliance deliverables (SSP, POA&M, policies, configuration guides)
export default async function DeliverablesPage() {
  const supabase = createServerSupabaseClient();

  // RLS restricts this to published artifacts on the client's own assessments
  // (auth is enforced by the portal layout)
  const { data: artifacts } = await supabase
    .from("generated_artifacts")
    .select("id, artifact_type, control_id, title, content, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  const items = artifacts ?? [];

  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Deliverables</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24, maxWidth: 700, lineHeight: 1.6 }}>
        Documents prepared for you by Galaxy Consulting — security plans, remediation plans, policies,
        and configuration guides. Download each as a Word document.
      </div>

      {items.length === 0 ? (
        <div style={{ ...card, color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
          No deliverables have been published yet. Documents will appear here once your
          consultant completes and publishes them.
        </div>
      ) : (
        items.map((a) => (
          <div key={a.id} style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
                  {TYPE_ICONS[a.artifact_type] ?? "📄"} {a.title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
                  Updated {new Date(a.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              </div>
              <a
                href={`/api/artifacts-export/${a.id}`}
                style={{
                  background: "rgba(0,201,255,0.12)", color: "#00C9FF", border: "1px solid rgba(0,201,255,0.35)",
                  borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, textDecoration: "none",
                }}
              >
                ⬇ Download DOCX
              </a>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>Preview</summary>
              <div style={{
                fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, whiteSpace: "pre-wrap",
                maxHeight: 400, overflowY: "auto", marginTop: 10, paddingTop: 10,
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}>
                {a.content}
              </div>
            </details>
          </div>
        ))
      )}
    </div>
  );
}
