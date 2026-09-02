import { redirect } from "next/navigation";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";
import { landingPathForRole } from "@/lib/roles";

const ADMIN_NAV = [
  { id: "dashboard", href: "/admin/dashboard", icon: "⊞", label: "All Clients" },
  { id: "clients", href: "/admin/clients", icon: "◈", label: "Clients" },
  { id: "reports", href: "/admin/reports", icon: "▤", label: "Analytics" },
  { id: "team", href: "/admin/team", icon: "◎", label: "Team" },
  { id: "profile", href: "/admin/profile", icon: "◉", label: "Profile" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // user_roles is authoritative — user_metadata is a copy that can drift, and
  // disagreeing with the portal layout's check would bounce the user in a loop.
  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (roleRow?.role !== "admin") redirect(landingPathForRole(roleRow?.role));

  const userName = user.user_metadata?.full_name || user.email || "Admin";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={ADMIN_NAV} userName={userName} userRole="admin" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
