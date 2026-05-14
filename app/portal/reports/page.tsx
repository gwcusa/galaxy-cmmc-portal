export default function ReportsPage() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>📄</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>PDF Reports — Phase 4</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Report generation is planned for Phase 4.</div>
      <a href="/portal/dashboard" style={{ padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF", textDecoration: "none" }}>Back to Dashboard</a>
    </div>
  );
}
