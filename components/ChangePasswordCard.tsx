"use client";

import { useState } from "react";

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "rgba(255,255,255,0.5)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0",
  fontSize: 14,
  outline: "none",
};

export default function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not change password.");
      return;
    }

    setSuccess(true);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Change Password</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 18 }}>
        At least 8 characters. You&apos;ll stay signed in here; any other devices will be signed out.
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 380 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={label} htmlFor="current-password">Current password</label>
          <input
            id="current-password" type="password" autoComplete="current-password"
            value={current} onChange={(e) => setCurrent(e.target.value)} required style={input}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label} htmlFor="new-password">New password</label>
          <input
            id="new-password" type="password" autoComplete="new-password"
            value={next} onChange={(e) => setNext(e.target.value)} required style={input}
          />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={label} htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password" type="password" autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} required style={input}
          />
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: "#F87171", background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8,
            padding: "8px 12px", marginBottom: 14,
          }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{
            fontSize: 12, color: "#4DFFA0", background: "rgba(77,255,160,0.08)",
            border: "1px solid rgba(77,255,160,0.2)", borderRadius: 8,
            padding: "8px 12px", marginBottom: 14,
          }}>
            Password updated.
          </div>
        )}

        <button type="submit" disabled={saving} style={{
          padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: saving ? "rgba(0,201,255,0.15)" : "#00C9FF",
          color: saving ? "rgba(255,255,255,0.5)" : "#050B18",
          border: "none", cursor: saving ? "default" : "pointer",
        }}>
          {saving ? "Saving…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}
