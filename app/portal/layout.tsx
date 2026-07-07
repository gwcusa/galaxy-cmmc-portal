import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const CLIENT_NAV = [
  { id: "dashboard", href: "/portal/dashboard", icon: "⬡", label: "Dashboard" },
  { id: "scoping", href: "/portal/scoping", icon: "◈", label: "Scoping" },
  { id: "assessment", href: "/portal/assessment", icon: "☑", label: "Gap Assessment" },
  { id: "documents", href: "/portal/documents", icon: "▤", label: "Documents" },
  { id: "deliverables", href: "/portal/deliverables", icon: "◫", label: "Deliverables" },
  { id: "reports", href: "/portal/reports", icon: "⬇", label: "Reports" },
  { id: "profile", href: "/portal/profile", icon: "◉", label: "Profile" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userName = user.user_metadata?.full_name || user.email || "User";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={CLIENT_NAV} userName={userName} userRole="client" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        <div
          style={{
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.35)",
            borderRadius: 8,
            padding: "10px 16px",
            marginBottom: 24,
            fontSize: 13,
            color: "#FBBF24",
            lineHeight: 1.5,
          }}
        >
          <strong>Do not upload CUI or FCI.</strong> This portal is for compliance
          evidence only — policies, procedures, configuration screenshots, and logs.
          Redact any Controlled Unclassified Information before uploading.
        </div>
        {children}
      </main>
    </div>
  );
}
