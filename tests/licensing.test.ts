import { describe, it, expect } from "vitest";
import { addMonths, computeEntitlement, hasPriorLicense, planAssignment, type LicenseRow } from "@/lib/licensing";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function lic(over: Partial<LicenseRow> = {}): LicenseRow {
  return {
    id: "lic-1",
    type: "single",
    starts_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2026-12-01T00:00:00.000Z",
    voided_at: null,
    package_name: "Single Assessment",
    ...over,
  };
}

const FINALIZED = { id: "a1", status: "finalized" };
const IN_PROGRESS = { id: "a1", status: "in_progress" };
const SUBMITTED = { id: "a1", status: "submitted" };

describe("computeEntitlement", () => {
  it("is none with no rows", () => {
    expect(computeEntitlement([], null, NOW)).toEqual({ status: "none", canEdit: false, canStartCycle: false });
  });

  it("is active for a row that has not expired", () => {
    const e = computeEntitlement([lic()], null, NOW);
    expect(e.status).toBe("active");
    expect(e.canEdit).toBe(true);
    if (e.status === "active") {
      expect(e.type).toBe("single");
      expect(e.packageName).toBe("Single Assessment");
      expect(e.licenseId).toBe("lic-1");
      expect(e.expiresAt).toBe("2026-12-01T00:00:00.000Z");
    }
  });

  it("is expired for a row whose expiry has passed", () => {
    const e = computeEntitlement([lic({ starts_at: "2026-06-01T00:00:00.000Z", expires_at: "2026-09-01T00:00:00.000Z" })], null, NOW);
    expect(e.status).toBe("expired");
    expect(e.canEdit).toBe(false);
    expect(e.canStartCycle).toBe(false);
    if (e.status === "expired") expect(e.expiresAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("treats expires_at equal to now as expired", () => {
    const e = computeEntitlement([lic({ expires_at: NOW.toISOString() })], null, NOW);
    expect(e.status).toBe("expired");
  });

  it("ignores voided rows and falls back to the latest non-voided row", () => {
    const rows = [
      lic({ id: "old", starts_at: "2026-01-01T00:00:00.000Z", expires_at: "2026-12-31T00:00:00.000Z" }),
      lic({ id: "voided", starts_at: "2026-09-10T00:00:00.000Z", expires_at: "2026-12-10T00:00:00.000Z", voided_at: "2026-09-11T00:00:00.000Z" }),
    ];
    const e = computeEntitlement(rows, null, NOW);
    expect(e.status).toBe("active");
    if (e.status === "active") expect(e.licenseId).toBe("old");
  });

  it("is none when every row is voided", () => {
    const rows = [lic({ voided_at: "2026-09-02T00:00:00.000Z" }), lic({ id: "lic-2", voided_at: "2026-09-03T00:00:00.000Z" })];
    expect(computeEntitlement(rows, FINALIZED, NOW)).toEqual({ status: "none", canEdit: false, canStartCycle: false });
  });

  it("takes the latest row by starts_at even if an older row expires later", () => {
    const rows = [
      lic({ id: "older", starts_at: "2026-01-01T00:00:00.000Z", expires_at: "2027-06-01T00:00:00.000Z" }),
      lic({ id: "newer", starts_at: "2026-08-01T00:00:00.000Z", expires_at: "2026-09-10T00:00:00.000Z" }),
    ];
    const e = computeEntitlement(rows, null, NOW);
    expect(e.status).toBe("expired");
    if (e.status === "expired") expect(e.licenseId).toBe("newer");
  });

  it("allows starting a cycle only for active unlimited with a finalized cycle", () => {
    const e = computeEntitlement([lic({ type: "unlimited", package_name: "Unlimited" })], FINALIZED, NOW);
    expect(e.status).toBe("active");
    expect(e.canStartCycle).toBe(true);
  });

  it("does not allow starting a cycle for an active single license", () => {
    const e = computeEntitlement([lic()], FINALIZED, NOW);
    expect(e.canStartCycle).toBe(false);
  });

  it("does not allow starting a cycle while the latest cycle is unfinished", () => {
    const e = computeEntitlement([lic({ type: "unlimited" })], IN_PROGRESS, NOW);
    expect(e.canStartCycle).toBe(false);
  });
});

describe("planAssignment", () => {
  it("rejects single when a prior license exists", () => {
    expect(planAssignment({ packageType: "single", hasPriorLicense: true, latestAssessment: null }))
      .toEqual({ allowed: false, reason: "single_requires_no_prior_license" });
  });

  it("allows single when every prior row is voided", () => {
    const prior = hasPriorLicense([lic({ voided_at: "2026-09-02T00:00:00.000Z" })]);
    expect(prior).toBe(false);
    expect(planAssignment({ packageType: "single", hasPriorLicense: prior, latestAssessment: null }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });

  it("rejects additional with no prior license", () => {
    expect(planAssignment({ packageType: "additional", hasPriorLicense: false, latestAssessment: null }))
      .toEqual({ allowed: false, reason: "additional_requires_prior_license" });
  });

  it("allows additional with one prior license", () => {
    expect(hasPriorLicense([lic()])).toBe(true);
    expect(planAssignment({ packageType: "additional", hasPriorLicense: true, latestAssessment: null }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });

  it("single: a finalized latest cycle opens a new one", () => {
    expect(planAssignment({ packageType: "single", hasPriorLicense: false, latestAssessment: FINALIZED }))
      .toEqual({ allowed: true, cycleAction: "open", previousAssessmentId: "a1" });
  });

  it("single: an unfinished latest cycle is reused", () => {
    expect(planAssignment({ packageType: "single", hasPriorLicense: false, latestAssessment: IN_PROGRESS }))
      .toEqual({ allowed: true, cycleAction: "reuse", assessmentId: "a1" });
  });

  it("single: no cycle takes no action", () => {
    expect(planAssignment({ packageType: "single", hasPriorLicense: false, latestAssessment: null }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });

  it("additional: a finalized latest cycle opens a new one", () => {
    expect(planAssignment({ packageType: "additional", hasPriorLicense: true, latestAssessment: FINALIZED }))
      .toEqual({ allowed: true, cycleAction: "open", previousAssessmentId: "a1" });
  });

  it("additional: an unfinished latest cycle (submitted) is reused", () => {
    expect(planAssignment({ packageType: "additional", hasPriorLicense: true, latestAssessment: SUBMITTED }))
      .toEqual({ allowed: true, cycleAction: "reuse", assessmentId: "a1" });
  });

  it("additional: no cycle takes no action", () => {
    expect(planAssignment({ packageType: "additional", hasPriorLicense: true, latestAssessment: null }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });

  it("unlimited: a finalized latest cycle takes no action (the client starts cycles)", () => {
    expect(planAssignment({ packageType: "unlimited", hasPriorLicense: true, latestAssessment: FINALIZED }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });

  it("unlimited: an unfinished latest cycle is reused", () => {
    expect(planAssignment({ packageType: "unlimited", hasPriorLicense: false, latestAssessment: IN_PROGRESS }))
      .toEqual({ allowed: true, cycleAction: "reuse", assessmentId: "a1" });
  });

  it("unlimited: no cycle takes no action", () => {
    expect(planAssignment({ packageType: "unlimited", hasPriorLicense: false, latestAssessment: null }))
      .toEqual({ allowed: true, cycleAction: "none" });
  });
});

describe("addMonths", () => {
  it("adds calendar months in UTC", () => {
    expect(addMonths(new Date("2026-09-25T10:00:00.000Z"), 3).toISOString()).toBe("2026-12-25T10:00:00.000Z");
    expect(addMonths(new Date("2026-09-25T10:00:00.000Z"), 12).toISOString()).toBe("2027-09-25T10:00:00.000Z");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addMonths(new Date("2026-11-30T00:00:00.000Z"), 3).toISOString()).toBe("2027-02-28T00:00:00.000Z");
    expect(addMonths(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});
