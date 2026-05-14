import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const ADMIN_NAV = [
  { id: "dashboard", href: "/admin/dashboard", icon: "⊞", label: "All Clients" },
  { id: "clients", href: "/admin/clients", icon: "◈", label: "Clients" },
  { id: "reports", href: "/admin/reports", icon: "▤", label: "Analytics" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const role = session.user.user_metadata?.role;
  if (role !== "admin") redirect("/portal/dashboard");

  const userName = session.user.user_metadata?.full_name || session.user.email || "Admin";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={ADMIN_NAV} userName={userName} userRole="admin" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
