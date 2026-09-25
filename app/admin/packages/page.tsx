"use client";

import { useState, useEffect, useCallback } from "react";

type PackageType = "single" | "additional" | "unlimited";

type Package = {
  id: string;
  name: string;
  type: PackageType;
  price_usd: number | string;
  duration_months: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type Draft = {
  name: string;
  priceUsd: string;
  durationMonths: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

const TYPE_LABEL: Record<PackageType, string> = {
  single: "Single Assessment",
  additional: "Additional Assessment",
  unlimited: "Unlimited",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, fontSize: 13,
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff", outline: "none", boxSizing: "border-box", width: "100%",
};

const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 12px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", verticalAlign: "top" };

function toDraft(p: Package): Draft {
  return {
    name: p.name,
    priceUsd: Number(p.price_usd).toFixed(2),
    durationMonths: String(p.duration_months),
    description: p.description ?? "",
    isActive: p.is_active,
    sortOrder: String(p.sort_order),
  };
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newPkg, setNewPkg] = useState({ name: "", type: "single" as PackageType, priceUsd: "0.00", durationMonths: "3", description: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/packages");
    const data = await res.json();
    if (!res.ok) { setLoadError(data.error ?? "Could not load packages."); setLoading(false); return; }
    const list = (data.packages ?? []) as Package[];
    setPackages(list);
    setDrafts(Object.fromEntries(list.map((p) => [p.id, toDraft(p)])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setRowMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    const res = await fetch("/api/admin/packages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: d.name,
        priceUsd: Number(d.priceUsd),
        durationMonths: Number(d.durationMonths),
        description: d.description,
        isActive: d.isActive,
        sortOrder: Number(d.sortOrder),
      }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) {
      setRowMsg((m) => ({ ...m, [id]: { ok: false, text: data.error ?? "Something went wrong." } }));
    } else {
      setRowMsg((m) => ({ ...m, [id]: { ok: true, text: "Saved" } }));
      load();
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPkg.name,
        type: newPkg.type,
        priceUsd: Number(newPkg.priceUsd),
        durationMonths: Number(newPkg.durationMonths),
        description: newPkg.description,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setAddError(data.error ?? "Something went wrong."); return; }
    setNewPkg({ name: "", type: "single", priceUsd: "0.00", durationMonths: "3", description: "" });
    setShowAdd(false);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Packages</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            The catalog clients see. Prices are shown to clients. At most one package of each type can be active.
          </div>
        </div>
        <button
          onClick={() => { setAddError(null); setShowAdd((v) => !v); }}
          style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", border: "none",
          }}
        >
          {showAdd ? "Cancel" : "+ Add package"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 16 }}>New package</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input value={newPkg.name} onChange={(e) => setNewPkg((p) => ({ ...p, name: e.target.value }))} placeholder="Name" required style={inputStyle} />
            <select value={newPkg.type} onChange={(e) => setNewPkg((p) => ({ ...p, type: e.target.value as PackageType }))} style={{ ...inputStyle, appearance: "none" }}>
              {(Object.keys(TYPE_LABEL) as PackageType[]).map((t) => (
                <option key={t} value={t} style={{ background: "#0A1428" }}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" value={newPkg.priceUsd} onChange={(e) => setNewPkg((p) => ({ ...p, priceUsd: e.target.value }))} placeholder="Price (USD)" style={inputStyle} />
            <input type="number" min="1" step="1" value={newPkg.durationMonths} onChange={(e) => setNewPkg((p) => ({ ...p, durationMonths: e.target.value }))} placeholder="Months" style={inputStyle} />
          </div>
          <input value={newPkg.description} onChange={(e) => setNewPkg((p) => ({ ...p, description: e.target.value }))} placeholder="Description shown to clients (optional)" style={{ ...inputStyle, marginBottom: 12 }} />
          {addError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 12 }}>{addError}</div>}
          <button type="submit" disabled={adding} style={{
            padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: adding ? "not-allowed" : "pointer",
            background: adding ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
            color: adding ? "rgba(255,255,255,0.4)" : "#050B18", border: "none",
          }}>
            {adding ? "Creating…" : "Create package"}
          </button>
        </form>
      )}

      <div style={card}>
        {loading ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading packages…</div>
        ) : loadError ? (
          <div style={{ fontSize: 13, color: "#F87171" }}>{loadError}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Type", "Name", "Price (USD)", "Months", "Description", "Active", "Order", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => {
                const d = drafts[p.id] ?? toDraft(p);
                const msg = rowMsg[p.id];
                const saving = savingId === p.id;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ ...tdStyle, fontSize: 12, color: "#00C9FF", fontWeight: 600, whiteSpace: "nowrap", paddingTop: 18 }}>
                      {TYPE_LABEL[p.type]}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 160 }}>
                      <input value={d.name} onChange={(e) => setDraft(p.id, { name: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 110 }}>
                      <input type="number" min="0" step="0.01" value={d.priceUsd} onChange={(e) => setDraft(p.id, { priceUsd: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 80 }}>
                      <input type="number" min="1" step="1" value={d.durationMonths} onChange={(e) => setDraft(p.id, { durationMonths: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, minWidth: 200 }}>
                      <input value={d.description} onChange={(e) => setDraft(p.id, { description: e.target.value })} placeholder="Shown to clients" style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 60, paddingTop: 18 }}>
                      <input type="checkbox" checked={d.isActive} onChange={(e) => setDraft(p.id, { isActive: e.target.checked })} style={{ accentColor: "#4DFFA0", width: 16, height: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, width: 70 }}>
                      <input type="number" step="1" value={d.sortOrder} onChange={(e) => setDraft(p.id, { sortOrder: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <button onClick={() => save(p.id)} disabled={saving} style={{
                        fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer",
                        background: saving ? "rgba(255,255,255,0.08)" : "rgba(0,201,255,0.1)",
                        color: saving ? "rgba(255,255,255,0.4)" : "#00C9FF",
                        border: "1px solid rgba(0,201,255,0.25)",
                      }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      {msg && (
                        <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? "#4DFFA0" : "#F87171", whiteSpace: "normal", maxWidth: 220 }}>
                          {msg.text}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !loadError && packages.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            No packages yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
