"use client";

import { useState, useEffect, useCallback } from "react";

type Assessor = { id: string; name: string; email: string; role: "admin" | "assessor" };

export default function TeamPage() {
  const [assessors, setAssessors] = useState<Assessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 24,
  };

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/assessors");
    if (res.ok) {
      const data = await res.json();
      setAssessors(data.assessors ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    const res = await fetch("/api/admin/assessors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to invite assessor");
    } else {
      setSuccess(`Invite sent to ${email.trim()}. They will receive a password setup email.`);
      setEmail("");
      setFullName("");
      fetchTeam();
    }
  }

  async function handleResetPassword(id: string) {
    setResettingId(id);
    const res = await fetch(`/api/admin/assessors/${id}/reset-password`, { method: "POST" });
    const data = await res.json();
    setResettingId(null);
    setResetMsg((prev) => ({ ...prev, [id]: { ok: res.ok, text: res.ok ? "Reset email sent!" : (data.error ?? "Failed") } }));
    setTimeout(() => setResetMsg((prev) => { const n = { ...prev }; delete n[id]; return n; }), 4000);
  }

  const adminMembers = assessors.filter((a) => a.role === "admin");
  const assessorMembers = assessors.filter((a) => a.role === "assessor");

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Team</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
          Manage assessors who can review client assessments.
        </div>
      </div>

      {/* Invite form */}
      <div style={{ ...card, marginBottom: 32 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Invite Assessor</div>
        <form onSubmit={handleInvite}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff", fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@example.com"
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff", fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          {error && (
            <div style={{ fontSize: 13, color: "#F87171", marginBottom: 12, padding: "8px 14px", background: "rgba(248,113,113,0.08)", borderRadius: 8 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ fontSize: 13, color: "#4DFFA0", marginBottom: 12, padding: "8px 14px", background: "rgba(77,255,160,0.08)", borderRadius: 8 }}>
              {success}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: submitting ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
              color: submitting ? "rgba(255,255,255,0.4)" : "#050B18",
              border: "none",
            }}
          >
            {submitting ? "Sending Invite…" : "Send Invite"}
          </button>
        </form>
      </div>

      {/* Current team */}
      {loading ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading team…</div>
      ) : (
        <>
          {assessorMembers.length > 0 && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                Assessors
              </div>
              {assessorMembers.map((a, i) => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #A78BFA, #00C9FF)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "#050B18", flexShrink: 0,
                  }}>
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{a.email}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    {resetMsg[a.id] && (
                      <span style={{ fontSize: 12, color: resetMsg[a.id].ok ? "#4DFFA0" : "#F87171" }}>
                        {resetMsg[a.id].text}
                      </span>
                    )}
                    <button
                      onClick={() => handleResetPassword(a.id)}
                      disabled={resettingId === a.id}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                        background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        opacity: resettingId === a.id ? 0.5 : 1,
                      }}
                    >
                      {resettingId === a.id ? "Sending…" : "Reset Password"}
                    </button>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      color: "#A78BFA", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)",
                    }}>
                      Assessor
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {adminMembers.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                Admins
              </div>
              {adminMembers.map((a, i) => (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "11px 0",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #00C9FF, #4DFFA0)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "#050B18", flexShrink: 0,
                  }}>
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{a.email}</div>
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
                    {resetMsg[a.id] && (
                      <span style={{ fontSize: 12, color: resetMsg[a.id].ok ? "#4DFFA0" : "#F87171" }}>
                        {resetMsg[a.id].text}
                      </span>
                    )}
                    <button
                      onClick={() => handleResetPassword(a.id)}
                      disabled={resettingId === a.id}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                        background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        opacity: resettingId === a.id ? 0.5 : 1,
                      }}
                    >
                      {resettingId === a.id ? "Sending…" : "Reset Password"}
                    </button>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                      color: "#00C9FF", background: "rgba(0,201,255,0.1)", border: "1px solid rgba(0,201,255,0.2)",
                    }}>
                      Admin
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {assessors.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              No team members yet. Invite your first assessor above.
            </div>
          )}
        </>
      )}
    </div>
  );
}
