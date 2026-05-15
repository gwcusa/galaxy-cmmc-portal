import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function AdminClientsPage() {
  const supabase = createServerSupabaseClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, cmmc_target_level, engagement_stage, created_at")
    .order("created_at", { ascending: false });

  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Clients</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{clients?.length ?? 0} total clients</div>
        </div>
      </div>

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Company", "Contact", "Phone", "CMMC Level", "Stage", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => {
              const color = stageColor[c.engagement_stage] ?? "#888";
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.company_name}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{c.contact_name}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{c.phone ?? "—"}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 12, color: "#00C9FF", fontWeight: 600 }}>L{c.cmmc_target_level}</span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}18`, color, fontWeight: 600, textTransform: "capitalize" }}>
                      {c.engagement_stage}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <Link href={`/admin/clients/${c.id}`} style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: "rgba(0,201,255,0.1)", color: "#00C9FF",
                      border: "1px solid rgba(0,201,255,0.2)", textDecoration: "none",
                    }}>
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(clients?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            No clients yet.
          </div>
        )}
      </div>
    </div>
  );
}
