"use client";

import RequestPackageButton from "@/components/RequestPackageButton";

/** The entitlement shape the portal receives from API responses. */
export type PortalEntitlement = {
  status: "none" | "expired" | "active";
  canEdit: boolean;
  canStartCycle: boolean;
  type?: "single" | "additional" | "unlimited";
  packageName?: string;
  expiresAt?: string;
};

export const NO_LICENSE: PortalEntitlement = { status: "none", canEdit: false, canStartCycle: false };

/** True when a write was refused because the license is not active. */
export function isLicenseInactiveResponse(res: globalThis.Response, body: { error?: string } | null): boolean {
  return res.status === 403 && body?.error === "license_inactive";
}

/** Local update after a write returns license_inactive (e.g. it expired while the page was open). */
export function markInactive(e: PortalEntitlement): PortalEntitlement {
  return { ...e, status: e.status === "none" ? "none" : "expired", canEdit: false, canStartCycle: false };
}

export default function LicenseBanner({ status }: { status: "none" | "expired" }) {
  return (
    <div style={{
      background: "rgba(255,179,71,0.06)", border: "1px solid rgba(255,179,71,0.25)",
      borderRadius: 12, padding: "14px 20px", marginBottom: 20,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
    }}>
      <div style={{ fontSize: 13, color: "#FFB347", lineHeight: 1.6 }}>
        {status === "expired"
          ? "Your license has expired. Contact Galaxy to purchase an additional assessment or the unlimited package."
          : "No active license. Contact Galaxy to purchase an assessment package."}
      </div>
      <RequestPackageButton />
    </div>
  );
}
