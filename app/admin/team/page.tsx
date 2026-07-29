"use client";

import { useState, useEffect, useCallback } from "react";

type TeamMember = { id: string; name: string; email: string; role: "admin" | "assessor" };

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, fontSize: 13,
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff", outline: "none",
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password reset inline form
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

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
      setMembers(data.assessors ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setInviteMsg(null);
    const res = await fetch("/api/admin/assessors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), fullName: fullName.trim() }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setInviteMsg({ ok: false, text: data.error ?? "Failed to invite assessor" });
    } else {
      setInviteMsg({ ok: true, text: `Account created for ${email.trim()}. Set their password below.` });
      setEmail("");
      setFullName("");
      fetchTeam();
    }
  }

  function openReset(id: string) {
    setExpandedId(id);
    setNewPassword("");
    setPwMsg((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  async function handleSetPassword(id: string) {
    if (newPassword.length < 8) {
      setPwMsg((prev) => ({ ...prev, [id]: { ok: false, text: "Min 8 characters" } }));
      return;
    }
    setSavingId(id);
    const res = await fetch(`/api/admin/assessors/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await res.json();
    setSavingId(null);
    if (res.ok) {
      setPwMsg((prev) => ({ ...prev, [id]: { ok: true, text: "Password updated!" } }));
      setExpandedId(null);
      setNewPassword("");
    } else {
      setPwMsg((prev) => ({ ...prev, [id]: { ok: false, text: data.error ?? "Failed" } }));
    }
  }

  function renderMember(a: TeamMember, i: number, badgeColor: string, badgeLabel: string) {
    const isExpanded = expandedId === a.id;
    const isSaving = savingId === a.id;
    const msg = pwMsg[a.id];

    return (
      <div key={a.id} style={{
        borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
        paddingTop: i > 0 ? 12 : 0,
        marginTop: i > 0 ? 12 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
            background: badgeLabel === "Assessor"
              ? "linear-gradient(135deg, #A78BFA, #00C9FF)"
              : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "#050B18",
          }}>
            {a.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{a.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{a.email}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {msg && !isExpanded && (
              <span style={{ fontSize: 12, color: msg.ok ? "#4DFFA0" : "#F87171" }}>{msg.text}</span>
            )}
            <button
              onClick={() => isExpanded ? setExpandedId(null) : openReset(a.id)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                background: isExpanded ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {isExpanded ? "Cancel" : "Reset Password"}
            </button>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              color: badgeColor,
              background: `${badgeColor}18`,
              border: `1px solid ${badgeColor}30`,
            }}>
              {badgeLabel}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div style={{
            marginTop: 12, marginLeft: 50,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSetPassword(a.id)}
              style={{ ...inputStyle, width: 240 }}
            />
            <button
              onClick={() => handleSetPassword(a.id)}
              disabled={isSaving}
              style={{
                fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: "pointer",
                background: isSaving ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
                color: isSaving ? "rgba(255,255,255,0.4)" : "#050B18",
                border: "none",
              }}
            >
              {isSaving ? "Saving…" : "Set Password"}
            </button>
            {msg && (
              <span style={{ fontSize: 12, color: msg.ok ? "#4DFFA0" : "#F87171" }}>{msg.text}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const adminMembers = members.filter((m) => m.role === "admin");
  const assessorMembers = members.filter((m) => m.role === "assessor");

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
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>Full Name</label>
              <input
                type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                required placeholder="Jane Smith"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "10px 14px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6 }}>Email Address</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="jane@example.com"
                style={{ ...inputStyle, width: "100%", boxSizing: "border-box", padding: "10px 14px" }}
              />
            </div>
          </div>
          {inviteMsg && (
            <div style={{
              fontSize: 13, marginBottom: 12, padding: "8px 14px", borderRadius: 8,
              color: inviteMsg.ok ? "#4DFFA0" : "#F87171",
              background: inviteMsg.ok ? "rgba(77,255,160,0.08)" : "rgba(248,113,113,0.08)",
            }}>
              {inviteMsg.text}
            </div>
          )}
          <button
            type="submit" disabled={submitting}
            style={{
              padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: submitting ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
              color: submitting ? "rgba(255,255,255,0.4)" : "#050B18", border: "none",
            }}
          >
            {submitting ? "Creating…" : "Create Account"}
          </button>
        </form>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading team…</div>
      ) : (
        <>
          {assessorMembers.length > 0 && (
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                Assessors
              </div>
              {assessorMembers.map((a, i) => renderMember(a, i, "#A78BFA", "Assessor"))}
            </div>
          )}

          {adminMembers.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>
                Admins
              </div>
              {adminMembers.map((a, i) => renderMember(a, i, "#00C9FF", "Admin"))}
            </div>
          )}

          {members.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
              No team members yet. Invite your first assessor above.
            </div>
          )}
        </>
      )}
    </div>
  );
}
