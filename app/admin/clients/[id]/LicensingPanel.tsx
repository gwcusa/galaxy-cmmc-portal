"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type LicenseType = "single" | "additional" | "unlimited";

type LicenseItem = {
  id: string;
  packageId: string;
  packageName: string;
  type: LicenseType;
  pricePaidUsd: number;
  startsAt: string;
  expiresAt: string;
  grantedBy: string | null;
  grantedByEmail: string | null;
  notes: string | null;
  assessmentId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

type Entitlement =
  | { status: "none"; canEdit: false; canStartCycle: false }
  | { status: "expired" | "active"; type: LicenseType; expiresAt: string; packageName: string; licenseId: string; canEdit: boolean; canStartCycle: boolean };

type AssignablePackage = {
  id: string;
  name: string;
  type: LicenseType;
  price_usd: number;
  duration_months: number;
  description: string | null;
  plan: { allowed: true; cycleAction: "open" | "reuse" | "none" } | { allowed: false; reason: string };
};

type PanelData = { licenses: LicenseItem[]; entitlement: Entitlement; assignablePackages: AssignablePackage[] };

const TYPE_LABEL: Record<LicenseType, string> = { single: "Single", additional: "Additional", unlimited: "Unlimited" };

const CYCLE_TEXT: Record<"open" | "reuse" | "none", string> = {
  open: "This opens a new assessment cycle. The client's previous answers carry forward.",
  reuse: "This continues the client's current, unfinished assessment cycle.",
  none: "No assessment cycle is opened now. The client's first cycle starts on their next visit.",
};

const REASON_TEXT: Record<string, string> = {
  single_requires_no_prior_license: "Single Assessment can only be assigned to a client with no prior license.",
  additional_requires_prior_license: "Additional Assessment requires a prior license.",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#0F172A", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16, padding: 32, width: 460, maxWidth: "90vw",
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
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "rgba(0,201,255,0.3)" : "#00C9FF", border: "none",
  borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
  color: "#0F172A", cursor: disabled ? "not-allowed" : "pointer",
});
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 24, marginBottom: 24,
};
const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", fontSize: 12, color: "rgba(255,255,255,0.6)", verticalAlign: "top" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function LicensingPanel({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<PanelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [price, setPrice] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Void modal
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${clientId}/licenses`);
    const body = await res.json();
    if (!res.ok) { setLoadError(body.error ?? "Could not load licenses."); return; }
    setLoadError(null);
    setData(body);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const allowedPackages = (data?.assignablePackages ?? []).filter((p) => p.plan.allowed);
  const blockedPackages = (data?.assignablePackages ?? []).filter((p) => !p.plan.allowed);
  const selected = allowedPackages.find((p) => p.id === packageId) ?? null;

  function openAssign() {
    const first = allowedPackages[0] ?? null;
    setPackageId(first?.id ?? "");
    setPrice(first ? first.price_usd.toFixed(2) : "0.00");
    setNotes("");
    setConfirming(false);
    setAssignError(null);
    setAssignOpen(true);
  }

  function choosePackage(id: string) {
    setPackageId(id);
    const p = allowedPackages.find((x) => x.id === id);
    if (p) setPrice(p.price_usd.toFixed(2));
  }

  async function submitAssign() {
    if (!selected) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/licenses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selected.id, pricePaidUsd: Number(price), notes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAssignError(body.message ?? REASON_TEXT[body.error] ?? body.error ?? "Something went wrong.");
        setConfirming(false);
      } else {
        setAssignOpen(false);
        await load();
        router.refresh();
      }
    } catch { setAssignError("Network error. Please try again."); }
    finally { setAssignLoading(false); }
  }

  function openVoid(id: string) {
    setVoidId(id);
    setVoidReason("");
    setVoidError(null);
  }

  async function submitVoid() {
    if (!voidId) return;
    if (!voidReason.trim()) { setVoidError("Enter a reason."); return; }
    setVoidLoading(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/admin/licenses/${voidId}/void`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason }),
      });
      const body = await res.json();
      if (!res.ok) { setVoidError(body.error ?? "Something went wrong."); }
      else { setVoidId(null); await load(); router.refresh(); }
    } catch { setVoidError("Network error. Please try again."); }
    finally { setVoidLoading(false); }
  }

  const entitlement = data?.entitlement ?? null;
  const badge = !entitlement
    ? { text: "Loading…", color: "rgba(255,255,255,0.35)" }
    : entitlement.status === "active"
      ? { text: `Active until ${fmt(entitlement.expiresAt)}`, color: "#4DFFA0" }
      : entitlement.status === "expired"
        ? { text: `Expired on ${fmt(entitlement.expiresAt)}`, color: "#F87171" }
        : { text: "No license", color: "#8892A0" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Licensing</div>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
          color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}33`,
        }}>
          {badge.text}
        </span>
        {entitlement && entitlement.status !== "none" && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {entitlement.packageName} · {TYPE_LABEL[entitlement.type]}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!readOnly && data && (
          <button onClick={openAssign} style={{
            padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: "rgba(0,201,255,0.1)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
          }}>
            Assign package
          </button>
        )}
      </div>

      {loadError && <div style={{ fontSize: 13, color: "#F87171" }}>{loadError}</div>}

      {data && data.licenses.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No purchases recorded.</div>
      )}

      {data && data.licenses.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Package", "Type", "Price", "Expires", "Notes", "Granted by", "Voided", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.licenses.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: l.voidedAt ? 0.55 : 1 }}>
                <td style={{ ...tdStyle, color: "#E2E8F0", whiteSpace: "nowrap" }}>{fmt(l.startsAt)}</td>
                <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{l.packageName}</td>
                <td style={tdStyle}>{TYPE_LABEL[l.type]}</td>
                <td style={tdStyle}>{money(l.pricePaidUsd)}</td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmt(l.expiresAt)}</td>
                <td style={tdStyle}>{l.notes ?? "—"}</td>
                <td style={tdStyle}>{l.grantedByEmail || (l.grantedBy ? "Admin" : "System")}</td>
                <td style={tdStyle}>
                  {l.voidedAt ? (
                    <span style={{ color: "#F87171" }}>{fmt(l.voidedAt)}{l.voidReason ? ` — ${l.voidReason}` : ""}</span>
                  ) : "—"}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {!readOnly && !l.voidedAt && (
                    <button onClick={() => openVoid(l.id)} style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(248,113,113,0.1)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)",
                    }}>
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Assign modal */}
      {assignOpen && (
        <div style={overlayStyle} onClick={() => setAssignOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              {confirming ? "Confirm assignment" : "Assign package"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Records an offline purchase. The license starts today and activates immediately.
            </div>

            {!confirming ? (
              <>
                {allowedPackages.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#FFB347", marginBottom: 16 }}>
                    No package can be assigned right now.
                    {blockedPackages.map((p) => (
                      <div key={p.id} style={{ color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
                        {p.name}: {!p.plan.allowed ? (REASON_TEXT[p.plan.reason] ?? p.plan.reason) : ""}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Package</label>
                      <select value={packageId} onChange={(e) => choosePackage(e.target.value)} style={{ ...inputStyle, appearance: "none" }}>
                        {allowedPackages.map((p) => (
                          <option key={p.id} value={p.id} style={{ background: "#0A1428" }}>
                            {p.name} — {money(p.price_usd)} · {p.duration_months} months
                          </option>
                        ))}
                      </select>
                      {selected?.description && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{selected.description}</div>
                      )}
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Price paid (USD)</label>
                      <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelStyle}>Notes (invoice or PO number)</label>
                      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="INV-1042" style={inputStyle} />
                    </div>
                  </>
                )}
                {assignError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{assignError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setAssignOpen(false)} style={cancelBtn}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!selected || !Number.isFinite(Number(price)) || Number(price) < 0}
                    style={primaryBtn(!selected || !Number.isFinite(Number(price)) || Number(price) < 0)}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : selected && (
              <>
                <div style={{ fontSize: 14, color: "#E2E8F0", lineHeight: 1.7, marginBottom: 12 }}>
                  Assign <strong style={{ color: "#fff" }}>{selected.name}</strong> for <strong style={{ color: "#fff" }}>{money(Number(price))}</strong>,
                  valid for {selected.duration_months} months from today.
                  {notes.trim() ? <> Notes: <em>{notes.trim()}</em>.</> : null}
                </div>
                <div style={{
                  fontSize: 13, color: "#00C9FF", background: "rgba(0,201,255,0.06)",
                  border: "1px solid rgba(0,201,255,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 20,
                }}>
                  {selected.plan.allowed ? CYCLE_TEXT[selected.plan.cycleAction] : ""}
                </div>
                {assignError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{assignError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setConfirming(false)} style={cancelBtn}>Back</button>
                  <button type="button" onClick={submitAssign} disabled={assignLoading} style={primaryBtn(assignLoading)}>
                    {assignLoading ? "Assigning…" : "Confirm assignment"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Void modal */}
      {voidId && (
        <div style={overlayStyle} onClick={() => setVoidId(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F87171", marginBottom: 8 }}>Void license</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              A voided license no longer counts toward the client's entitlement. The purchase stays in the history with your reason.
              Any assessment cycle it opened is left as is.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reason</label>
              <textarea
                value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3}
                placeholder="Entered in error / refunded / duplicate purchase"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            {voidError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{voidError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setVoidId(null)} style={cancelBtn}>Cancel</button>
              <button onClick={submitVoid} disabled={voidLoading} style={{
                background: "#F87171", border: "none", borderRadius: 8,
                padding: "8px 20px", fontSize: 13, fontWeight: 700, color: "#fff",
                cursor: voidLoading ? "not-allowed" : "pointer", opacity: voidLoading ? 0.6 : 1,
              }}>
                {voidLoading ? "Voiding…" : "Void license"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
