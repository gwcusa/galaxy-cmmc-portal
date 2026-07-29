import { redirect } from "next/navigation";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const ASSESSOR_NAV = [
  { id: "dashboard", href: "/assessor/dashboard", icon: "⊞", label: "Clients" },
];

export default async function AssessorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceSupabaseClient();
  const { data: roleRow } = await svc.from("user_roles").select("role").eq("user_id", user.id).single();
  if (!["admin", "assessor"].includes(roleRow?.role ?? "")) redirect("/portal/dashboard");

  const userName = user.user_metadata?.full_name || user.email || "Assessor";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={ASSESSOR_NAV} userName={userName} userRole="assessor" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
