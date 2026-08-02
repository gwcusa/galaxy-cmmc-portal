"use client";

import { useState } from "react";

export type SectionBadge = { text: string; color: string };

export default function CollapsibleSection({
  id,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  locked = false,
  lockedReason,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  badge?: SectionBadge | null;
  defaultOpen?: boolean;
  locked?: boolean;
  lockedReason?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen && !locked);

  return (
    <div id={id} style={{
      marginBottom: 16,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.08)",
      background: "rgba(255,255,255,0.02)",
      overflow: "hidden",
      opacity: locked ? 0.65 : 1,
    }}>
      <button
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={locked}
        style={{
          width: "100%", boxSizing: "border-box",
          display: "flex", alignItems: "center", gap: 14,
          padding: "18px 22px",
          background: "transparent", border: "none",
          cursor: locked ? "not-allowed" : "pointer",
          textAlign: "left",
        }}
      >
        <span style={{
          fontSize: 14, color: "rgba(255,255,255,0.35)", width: 14, flexShrink: 0,
        }}>
          {locked ? "🔒" : open ? "▾" : "▸"}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
              {subtitle}
            </div>
          )}
        </div>
        {badge && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20, flexShrink: 0,
            color: badge.color,
            background: `${badge.color}18`,
            border: `1px solid ${badge.color}33`,
          }}>
            {badge.text}
          </span>
        )}
      </button>

      {locked && lockedReason && (
        <div style={{
          padding: "0 22px 18px 50px",
          fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5,
        }}>
          {lockedReason}
        </div>
      )}

      {open && !locked && (
        <div style={{ padding: "4px 22px 22px 22px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ marginTop: 18 }}>{children}</div>
        </div>
      )}
    </div>
  );
}
