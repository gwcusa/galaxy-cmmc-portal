"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type NavItem = {
  id: string;
  href: string;
  icon: string;
  label: string;
};

type Props = {
  items: NavItem[];
  userName: string;
  userRole: string;
};

export default function Sidebar({ items, userName, userRole }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{
      width: 240, background: "rgba(255,255,255,0.03)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, bottom: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          width: 36, height: 36, background: "linear-gradient(135deg, #00C9FF, #4DFFA0)",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, marginBottom: 10,
        }}>🌌</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "0.5px" }}>Galaxy Consulting</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "1px", textTransform: "uppercase", marginTop: 2 }}>CMMC Portal</div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <a key={item.id} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: 500,
              background: active ? "rgba(0,201,255,0.1)" : "transparent",
              color: active ? "#00C9FF" : "rgba(255,255,255,0.5)",
              borderLeft: active ? "2px solid #00C9FF" : "2px solid transparent",
              textDecoration: "none", transition: "all 0.15s",
            }}>
              <span>{item.icon}</span> {item.label}
            </a>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #00C9FF44, #4DFFA044)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{userName}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "capitalize" }}>{userRole}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          width: "100%", padding: "7px 12px", borderRadius: 6, fontSize: 12,
          background: "rgba(248,113,113,0.08)", color: "#F87171",
          border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer",
        }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
