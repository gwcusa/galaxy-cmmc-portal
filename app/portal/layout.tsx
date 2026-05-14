import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const CLIENT_NAV = [
  { id: "dashboard", href: "/portal/dashboard", icon: "⬡", label: "Dashboard" },
  { id: "assessment", href: "/portal/assessment", icon: "☑", label: "Gap Assessment" },
  { id: "reports", href: "/portal/reports", icon: "⬇", label: "Reports" },
  { id: "profile", href: "/portal/profile", icon: "◉", label: "Profile" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const userName = session.user.user_metadata?.full_name || session.user.email || "User";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={CLIENT_NAV} userName={userName} userRole="client" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
