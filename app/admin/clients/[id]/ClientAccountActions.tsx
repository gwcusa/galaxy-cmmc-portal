"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  clientId: string;
  companyName: string;
  currentEmail: string;
  isDisabled: boolean;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#0F172A", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
  padding: "10px 14px", fontSize: 14, color: "#E2E8F0", outline: "none", boxSizing: "border-box",
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600,
  color: "rgba(255,255,255,0.5)", cursor: "pointer",
};

export default function ClientAccountActions({ clientId, companyName, currentEmail, isDisabled }: Props) {
  const router = useRouter();

  // Email modal
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Disable modal
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(isDisabled);

  // Delete modal
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Email ---
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError(null);
    if (!email.includes("@")) { setEmailError("Enter a valid email address."); return; }
    setEmailLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/email`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setEmailError(data.error ?? "Something went wrong."); }
      else { setEmailSuccess(true); router.refresh(); }
    } catch { setEmailError("Network error. Please try again."); }
    finally { setEmailLoading(false); }
  }

  // --- Disable / Enable ---
  async function handleDisableToggle() {
    setDisableError(null);
    setDisableLoading(true);
    const next = !disabled;
    try {
      const res = await fetch(`/api/clients/${clientId}/disable`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next }),
      });
      const data = await res.json();
      if (!res.ok) { setDisableError(data.error ?? "Something went wrong."); }
      else { setDisabled(next); setDisableOpen(false); router.refresh(); }
    } catch { setDisableError("Network error. Please try again."); }
    finally { setDisableLoading(false); }
  }

  // --- Delete ---
  async function handleDelete() {
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? "Something went wrong."); }
      else { router.push("/admin/clients"); }
    } catch { setDeleteError("Network error. Please try again."); }
    finally { setDeleteLoading(false); }
  }

  const btnBase: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600,
    color: "#E2E8F0", cursor: "pointer",
  };

  return (
    <>
      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setEmail(currentEmail); setEmailError(null); setEmailSuccess(false); setEmailOpen(true); }} style={btnBase}>
          Edit Email
        </button>
        <button
          onClick={() => { setDisableError(null); setDisableOpen(true); }}
          style={{ ...btnBase, color: disabled ? "#4DFFA0" : "#FFB347", borderColor: disabled ? "rgba(77,255,160,0.25)" : "rgba(255,179,71,0.25)" }}
        >
          {disabled ? "Enable Account" : "Disable Account"}
        </button>
        <button
          onClick={() => { setDeleteConfirm(""); setDeleteError(null); setDeleteOpen(true); }}
          style={{ ...btnBase, color: "#F87171", borderColor: "rgba(248,113,113,0.25)" }}
        >
          Delete
        </button>
      </div>

      {/* Edit Email Modal */}
      {emailOpen && (
        <div style={overlayStyle} onClick={() => setEmailOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Edit Client Email</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Updates the login email for this client account.
            </div>
            {emailSuccess ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#4DFFA0", marginBottom: 8 }}>Email updated</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
                  The client will need to use the new email to log in.
                </div>
                <button onClick={() => setEmailOpen(false)} style={cancelBtn}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>New Email</label>
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com" required style={inputStyle}
                  />
                </div>
                {emailError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{emailError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setEmailOpen(false)} style={cancelBtn}>Cancel</button>
                  <button type="submit" disabled={emailLoading} style={{
                    background: emailLoading ? "rgba(0,201,255,0.3)" : "#00C9FF", border: "none",
                    borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
                    color: "#0F172A", cursor: emailLoading ? "not-allowed" : "pointer",
                  }}>
                    {emailLoading ? "Saving…" : "Update Email"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Disable / Enable Modal */}
      {disableOpen && (
        <div style={overlayStyle} onClick={() => setDisableOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              {disabled ? "Enable Account" : "Disable Account"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              {disabled
                ? "This will restore login access for this client."
                : "This will immediately block this client from logging in. Their data is preserved."}
            </div>
            {disableError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{disableError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDisableOpen(false)} style={cancelBtn}>Cancel</button>
              <button onClick={handleDisableToggle} disabled={disableLoading} style={{
                background: disabled ? "#4DFFA0" : "#FFB347", border: "none",
                borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
                color: "#0F172A", cursor: disableLoading ? "not-allowed" : "pointer",
                opacity: disableLoading ? 0.6 : 1,
              }}>
                {disableLoading ? "Saving…" : disabled ? "Enable" : "Disable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteOpen && (
        <div style={overlayStyle} onClick={() => setDeleteOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F87171", marginBottom: 8 }}>Delete Client</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              This permanently deletes <strong style={{ color: "#fff" }}>{companyName}</strong> and all their assessment data.
              This cannot be undone.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Type <strong style={{ color: "#fff" }}>{companyName}</strong> to confirm</label>
              <input
                type="text" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={companyName} style={inputStyle}
              />
            </div>
            {deleteError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{deleteError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteOpen(false)} style={cancelBtn}>Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== companyName || deleteLoading}
                style={{
                  background: "#F87171", border: "none", borderRadius: 8,
                  padding: "8px 20px", fontSize: 13, fontWeight: 700, color: "#fff",
                  cursor: deleteConfirm !== companyName || deleteLoading ? "not-allowed" : "pointer",
                  opacity: deleteConfirm !== companyName || deleteLoading ? 0.4 : 1,
                }}
              >
                {deleteLoading ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
