"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

type PackageOption = {
  id: string;
  name: string;
  type: string;
  price_usd: number | string;
  duration_months: number;
  description: string | null;
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

export default function RequestPackageButton() {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageId, setPackageId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active packages are readable by any signed-in user through RLS.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from("packages")
      .select("id, name, type, price_usd, duration_months, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as PackageOption[];
        setPackages(list);
        setPackageId((current) => current || (list[0]?.id ?? ""));
      });
  }, [open]);

  const selected = packages.find((p) => p.id === packageId) ?? null;

  function openModal() {
    setSent(false);
    setError(null);
    setMessage("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!packageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/licenses/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, message }),
      });
      const data = await res.json();
      if (!res.ok) setError((res.status === 429 && data.message) || data.error || "Something went wrong.");
      else setSent(true);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <>
      <button onClick={openModal} style={{
        padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
        background: "rgba(0,201,255,0.1)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
        whiteSpace: "nowrap",
      }}>
        Request package
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Request a package</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Galaxy will contact you to arrange payment. Your license activates once the purchase is recorded.
            </div>
            {sent ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#4DFFA0", marginBottom: 24 }}>Your request was sent to Galaxy.</div>
                <button onClick={() => setOpen(false)} style={cancelBtn}>Close</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Package</label>
                  <select value={packageId} onChange={(e) => setPackageId(e.target.value)} required style={{ ...inputStyle, appearance: "none" }}>
                    {packages.length === 0 && <option value="" style={{ background: "#0A1428" }}>Loading…</option>}
                    {packages.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "#0A1428" }}>
                        {p.name} — ${Number(p.price_usd).toFixed(2)} · {p.duration_months} months
                      </option>
                    ))}
                  </select>
                  {selected?.description && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>{selected.description}</div>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Message (optional)</label>
                  <textarea
                    value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                    placeholder="Anything Galaxy should know — PO number, timing, questions."
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                {error && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{error}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setOpen(false)} style={cancelBtn}>Cancel</button>
                  <button type="submit" disabled={loading || !packageId} style={{
                    background: loading || !packageId ? "rgba(0,201,255,0.3)" : "#00C9FF", border: "none",
                    borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
                    color: "#0F172A", cursor: loading || !packageId ? "not-allowed" : "pointer",
                  }}>
                    {loading ? "Sending…" : "Send request"}
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
