import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 24 }}>Profile</div>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Email</div>
        <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 16 }}>{session?.user.email}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Contact Galaxy Consulting to update account details.</div>
      </div>
    </div>
  );
}
