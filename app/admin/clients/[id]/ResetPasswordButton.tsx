"use client";

import { useState } from "react";

export default function ResetPasswordButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleOpen() {
    setOpen(true);
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccess(false);
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 13,
          fontWeight: 600,
          color: "#E2E8F0",
          cursor: "pointer",
        }}
      >
        Reset Password
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={handleClose}
        >
          <div
            style={{
              background: "#0F172A",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: 32,
              width: 400,
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              Reset Client Password
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Set a new password for this client account.
            </div>

            {success ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#4DFFA0", marginBottom: 8 }}>
                  Password updated
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
                  The client can now log in with the new password.
                </div>
                <button
                  onClick={handleClose}
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                    padding: "8px 24px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#E2E8F0",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#E2E8F0",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    required
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 14,
                      color: "#E2E8F0",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {error && (
                  <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{error}</div>
                )}

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={handleClose}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.5)",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      background: loading ? "rgba(0,201,255,0.3)" : "#00C9FF",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 20px",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#0F172A",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {loading ? "Saving…" : "Set Password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
