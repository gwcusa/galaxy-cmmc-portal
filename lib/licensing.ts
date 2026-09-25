import { NextResponse } from "next/server";
import type { createServiceSupabaseClient } from "@/lib/supabase-server";
import { formatLicenseDate } from "@/lib/format-date";

type Svc = ReturnType<typeof createServiceSupabaseClient>;

export type LicenseType = "single" | "additional" | "unlimited";

/** A ledger row joined to its package name — the shape computeEntitlement consumes. */
export type LicenseRow = {
  id: string;
  type: LicenseType;
  starts_at: string;
  expires_at: string;
  voided_at: string | null;
  package_name: string;
};

/** The client's latest non-archived assessment by started_at, or null. */
export type LatestAssessment = { id: string; status: string } | null;

export type Entitlement =
  | { status: "none"; canEdit: false; canStartCycle: false }
  | {
      status: "expired" | "active";
      type: LicenseType;
      expiresAt: string;
      packageName: string;
      licenseId: string;
      canEdit: boolean;
      canStartCycle: boolean;
    };

export type AssignmentRejection = "single_requires_no_prior_license" | "additional_requires_prior_license";

export type AssignmentPlan =
  | { allowed: true; cycleAction: "open"; previousAssessmentId: string }
  | { allowed: true; cycleAction: "reuse"; assessmentId: string }
  | { allowed: true; cycleAction: "none" }
  | { allowed: false; reason: AssignmentRejection };

/** "Unfinished" means any status other than finalized and archived. */
export function isUnfinished(status: string): boolean {
  return status !== "finalized" && status !== "archived";
}

/** Adds calendar months in UTC, clamping to the target month's last day. */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayOfTarget = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month + months,
    Math.min(day, lastDayOfTarget),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

/** True when the client has at least one non-voided ledger row. */
export function hasPriorLicense(licenses: LicenseRow[]): boolean {
  return licenses.some((l) => !l.voided_at);
}

export function computeEntitlement(licenses: LicenseRow[], latestAssessment: LatestAssessment, now: Date): Entitlement {
  const live = licenses.filter((l) => !l.voided_at);
  if (live.length === 0) return { status: "none", canEdit: false, canStartCycle: false };

  const latest = live.reduce((best, l) =>
    new Date(l.starts_at).getTime() > new Date(best.starts_at).getTime() ? l : best
  );
  const base = {
    type: latest.type,
    expiresAt: latest.expires_at,
    packageName: latest.package_name,
    licenseId: latest.id,
  };

  if (new Date(latest.expires_at).getTime() <= now.getTime()) {
    return { status: "expired", ...base, canEdit: false, canStartCycle: false };
  }
  return {
    status: "active",
    ...base,
    canEdit: true,
    canStartCycle: latest.type === "unlimited" && latestAssessment?.status === "finalized",
  };
}

export function planAssignment(input: {
  packageType: LicenseType;
  hasPriorLicense: boolean;
  latestAssessment: LatestAssessment;
}): AssignmentPlan {
  const { packageType, hasPriorLicense: prior, latestAssessment } = input;
  if (packageType === "single" && prior) return { allowed: false, reason: "single_requires_no_prior_license" };
  if (packageType === "additional" && !prior) return { allowed: false, reason: "additional_requires_prior_license" };
  if (!latestAssessment) return { allowed: true, cycleAction: "none" };
  if (isUnfinished(latestAssessment.status)) return { allowed: true, cycleAction: "reuse", assessmentId: latestAssessment.id };
  if (latestAssessment.status === "finalized" && packageType !== "unlimited") {
    return { allowed: true, cycleAction: "open", previousAssessmentId: latestAssessment.id };
  }
  return { allowed: true, cycleAction: "none" };
}

// ---------------------------------------------------------------------------
// Readers (service client)
// ---------------------------------------------------------------------------

type RawLicenseRow = {
  id: string;
  type: string;
  starts_at: string;
  expires_at: string;
  voided_at: string | null;
  packages: { name: string } | { name: string }[] | null;
};

/** Normalizes rows selected with `packages(name)` into LicenseRow. */
export function toLicenseRows(rows: RawLicenseRow[]): LicenseRow[] {
  return rows.map((r) => {
    const pkg = Array.isArray(r.packages) ? r.packages[0] : r.packages;
    return {
      id: r.id,
      type: r.type as LicenseType,
      starts_at: r.starts_at,
      expires_at: r.expires_at,
      voided_at: r.voided_at,
      package_name: pkg?.name ?? "",
    };
  });
}

export const LICENSE_SELECT = "id, type, starts_at, expires_at, voided_at, packages(name)";

export async function loadLicenseContext(
  svc: Svc,
  clientId: string
): Promise<{ licenses: LicenseRow[]; latestAssessment: LatestAssessment }> {
  const [{ data: licenseRows }, { data: latest }] = await Promise.all([
    svc.from("client_licenses").select(LICENSE_SELECT).eq("client_id", clientId).order("starts_at", { ascending: false }),
    svc
      .from("assessments")
      .select("id, status")
      .eq("client_id", clientId)
      .not("status", "eq", "archived")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    licenses: toLicenseRows((licenseRows ?? []) as unknown as RawLicenseRow[]),
    latestAssessment: latest ? { id: latest.id as string, status: latest.status as string } : null,
  };
}

export async function getEntitlement(svc: Svc, clientId: string): Promise<Entitlement> {
  const { licenses, latestAssessment } = await loadLicenseContext(svc, clientId);
  return computeEntitlement(licenses, latestAssessment, new Date());
}

/** Route helper: null when the client may edit, otherwise the 403 license_inactive response. */
export async function requireClientLicense(svc: Svc, clientId: string): Promise<NextResponse | null> {
  const entitlement = await getEntitlement(svc, clientId);
  if (entitlement.canEdit) return null;
  return NextResponse.json({ error: "license_inactive" }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Display helpers for server components
// ---------------------------------------------------------------------------

/** "December 25, 2026" (UTC) */
export function formatLongDate(iso: string): string {
  return formatLicenseDate(iso, "long");
}

/** "Dec 25, 2026" (UTC) */
export function formatShortDate(iso: string): string {
  return formatLicenseDate(iso, "short");
}

/** List-column label such as "Active, Dec 25, 2026" / "Expired, Sep 1, 2026" / "None". */
export function entitlementSummary(entitlement: Entitlement): { label: string; color: string } {
  if (entitlement.status === "active") return { label: `Active, ${formatShortDate(entitlement.expiresAt)}`, color: "#4DFFA0" };
  if (entitlement.status === "expired") return { label: `Expired, ${formatShortDate(entitlement.expiresAt)}`, color: "#F87171" };
  return { label: "None", color: "rgba(255,255,255,0.3)" };
}
