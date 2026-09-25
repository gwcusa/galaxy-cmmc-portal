import { createServerSupabaseClient } from "@/lib/supabase-server";
import ProfileView from "@/components/ProfileView";
import { formatShortDate } from "@/lib/licensing";

type Purchase = {
  id: string;
  type: string;
  price_paid_usd: number | string;
  starts_at: string;
  expires_at: string;
  voided_at: string | null;
  void_reason: string | null;
  packages: { name: string } | { name: string }[] | null;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
  marginTop: 24,
};

const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", fontSize: 13, color: "rgba(255,255,255,0.6)" };

function packageName(p: Purchase): string {
  const pkg = Array.isArray(p.packages) ? p.packages[0] : p.packages;
  return pkg?.name ?? "";
}

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Reads through RLS: client_licenses_client_read and packages_read_authenticated.
  let purchases: Purchase[] = [];
  if (user) {
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (client) {
      const { data } = await supabase
        .from("client_licenses")
        .select("id, type, price_paid_usd, starts_at, expires_at, voided_at, void_reason, packages(name)")
        .eq("client_id", client.id)
        .order("starts_at", { ascending: false });
      purchases = (data ?? []) as unknown as Purchase[];
    }
  }

  return (
    <div>
      <ProfileView
        email={user?.email}
        fullName={user?.user_metadata?.full_name ?? null}
        role="client"
        note="Contact Galaxy Consulting to update your account details."
      />

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Purchases</div>
        {purchases.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No purchases yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Package", "Purchased", "Expires", "Price paid", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: p.voided_at ? 0.55 : 1 }}>
                  <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{packageName(p)}</td>
                  <td style={tdStyle}>{formatShortDate(p.starts_at)}</td>
                  <td style={tdStyle}>{formatShortDate(p.expires_at)}</td>
                  <td style={tdStyle}>${Number(p.price_paid_usd).toFixed(2)}</td>
                  <td style={tdStyle}>
                    {p.voided_at && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#F87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                        Voided
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
