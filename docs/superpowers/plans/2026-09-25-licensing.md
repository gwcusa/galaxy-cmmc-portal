# Client Licensing and Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-editable package catalog and an append-only license ledger, derive each client's entitlement from that ledger, gate every client write route on an active license, let admins assign and void licenses, let Unlimited clients start their own cycles, remind clients 14 days before expiry, and document it all in the SRS — exactly as specified in `docs/superpowers/specs/2026-09-25-licensing-design.md`.

**Architecture:** Two new tables (`packages`, `client_licenses`) in migration `023_licensing.sql`. Pure entitlement rules in `lib/licensing.ts` (`computeEntitlement`, `planAssignment`, `addMonths`) plus service-client readers (`getEntitlement`, `requireClientLicense`). The cycle-opening logic moves out of the reassess route into `lib/reassessment.ts` (`startReassessmentCycle`) so the admin reassess route, the admin assign route and the client start-cycle route share it. Client write routes call `requireClientLicense` after their existing ownership/status checks and return 403 `{ "error": "license_inactive" }`. Admin UI: `/admin/packages` page and a `LicensingPanel` on the admin and assessor client pages. Portal UI: license card, inactive banners, request-package modal, purchases list, previous-cycle reference, start-cycle button. Daily cron gains a 14-day expiry reminder. Three new emails in `lib/email.ts`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (service client for writes, RLS for portal/admin server-component reads), Resend via `lib/email.ts`, Vitest 4 (`npm test`), route smoke test (`npm run smoke`), `docx` export via `npm run docs:srs-docx`.

---

## Conventions the whole plan follows

- Routes read the user with `createServerSupabaseClient().auth.getUser()` and write through `createServiceSupabaseClient()` (never cookie-backed). Admin routes use `requireAdmin()` / `requireAdminOrAssessor()` from `lib/auth-helpers.ts` and the `if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });` guard.
- Audit rows are written with `logAudit({ actorId, actorRole, action, entityType, entityId, metadata })` from `lib/audit.ts`, never awaited in the response path.
- Emails are fire-and-forget: `sendX({...}).catch(() => {})`, except inside the cron where they are awaited (matches the existing re-affirmation job).
- Client components fetch with `fetch("/api/...")`, `const data = await res.json()`, and show `data.error ?? "Something went wrong."` inline.
- Client components never import `lib/licensing.ts` (it imports `next/server`). They get entitlement from API responses.
- Shell is PowerShell 5.1: chain with `;`, not `&&`. Commit messages use two `-m` flags so the trailer lands after a blank line.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (the second `-m` produces exactly that).

## Parallelization

Chunks follow spec section 13. Chunk 1 must finish first. After that:

| Chunk | Tasks | Can start when | Independent of |
|---|---|---|---|
| 1 — Foundation | 1–6 | now | — |
| 2 — Enforcement + route tests | 7–8 | chunk 1 done | 3, 5 |
| 3 — Admin API + admin UI | 9–13 | chunk 1 done | 2, 4, 5 |
| 4 — Portal UI + start-cycle + request | 14–20 | chunk 1 done; **Task 14 only** after Task 7 (it appends to `tests/license-gates.test.ts`, which Task 7 creates) | 3, 5 |
| 5 — Cron expiry job | 21 | chunk 1 done | 2, 3, 4 |
| 6 — Docs, smoke, verification | 22–24 | chunks 2–5 done | — |

Two deliberate moves from the spec's chunk list keep 3, 4 and 5 truly independent: the three email senders (spec chunk 5) are built in chunk 1 (Task 4) because chunk 3's assign route and chunk 4's request route call them; and the `GET /api/assessment` additions (`previousResponses`, `entitlement`) are built in chunk 1 (Task 5) because chunk 4's portal pages read them while chunk 2 edits the same file's `POST`. The shared route-test harness (Task 6) is also in chunk 1 so Tasks 7 and 14 both use it.

Files touched by more than one chunk (disjoint regions, merge cleanly): `app/api/assessment/route.ts` (Task 5 GET, Task 7 POST), `tests/license-gates.test.ts` (Task 7 creates, Task 14 appends one `describe`).

## File structure

| File | Action | Single responsibility |
|---|---|---|
| `supabase/migrations/023_licensing.sql` | Create | `packages` catalog, `client_licenses` ledger, RLS, seed, grandfathering |
| `lib/licensing.ts` | Create | Entitlement types and pure rules; service-client readers; `requireClientLicense` gate; date/label helpers for server components |
| `lib/reassessment.ts` | Create | `startReassessmentCycle` shared by reassess, assign and start-cycle routes |
| `lib/email.ts` | Modify (append) | `sendPackageAssignedEmail`, `sendLicenseExpiringEmail`, `sendPackageRequestEmail` |
| `tests/licensing.test.ts` | Create | Unit tests for `computeEntitlement`, `planAssignment`, `addMonths` |
| `tests/helpers/fake-supabase.ts` | Create | In-memory Supabase stand-in for route tests |
| `tests/license-gates.test.ts` | Create (Task 7), append (Task 14) | Route tests for the five gated handlers |
| `app/api/admin/assessment/[id]/reassess/route.ts` | Modify (rewrite) | Thin wrapper over `startReassessmentCycle` |
| `app/api/assessment/route.ts` | Modify | GET gains `previousResponses` + `entitlement`; POST gains ownership, status and license checks |
| `app/api/assessment/submit/route.ts` | Modify | License gate |
| `app/api/artifacts/route.ts` | Modify | License gate on POST and DELETE |
| `app/api/scoping/route.ts` | Modify | License gate for non-staff on POST |
| `app/api/info-requests/[id]/respond/route.ts` | Modify | License gate |
| `app/api/documents/route.ts` | Modify | License gate on POST/DELETE for non-staff; GET returns `entitlement` |
| `app/api/documents/links/route.ts` | Modify | License gate for non-staff |
| `app/api/documents/analyze/route.ts` | Modify | License gate for non-staff |
| `app/api/assessment/start-cycle/route.ts` | Create | Client starts next cycle under Unlimited |
| `app/api/licenses/request/route.ts` | Create | Client requests a package (email + audit) |
| `app/api/admin/packages/route.ts` | Create | GET / POST / PUT catalog |
| `app/api/admin/clients/[id]/licenses/route.ts` | Create | GET ledger + entitlement + assignable packages; POST assign |
| `app/api/admin/licenses/[id]/void/route.ts` | Create | POST void with reason |
| `app/api/cron/reaffirmation/route.ts` | Modify | Second job: 14-day expiry reminders |
| `app/admin/layout.tsx` | Modify | Packages nav entry |
| `app/admin/packages/page.tsx` | Create | Catalog table with inline edit and add |
| `app/admin/clients/[id]/LicensingPanel.tsx` | Create | Entitlement badge, history, assign form, void modal, `readOnly` |
| `app/admin/clients/[id]/page.tsx` | Modify | Render `LicensingPanel` |
| `app/assessor/clients/[id]/page.tsx` | Modify | Render `LicensingPanel readOnly` |
| `app/admin/clients/page.tsx` | Modify | License column |
| `app/admin/dashboard/page.tsx` | Modify | License column |
| `components/LicenseBanner.tsx` | Create | Inactive banner + shared portal entitlement type/helpers |
| `components/RequestPackageButton.tsx` | Create | Request-package modal |
| `components/StartCycleButton.tsx` | Create | Calls start-cycle route |
| `app/portal/dashboard/page.tsx` | Modify | License card, start-cycle card |
| `app/portal/assessment/page.tsx` | Modify | Banner, disabled controls, previous-cycle reference, finalized copy |
| `app/portal/scoping/page.tsx` | Modify | Banner, disabled controls |
| `app/portal/documents/page.tsx` | Modify | Banner, disabled controls |
| `app/portal/profile/page.tsx` | Modify | Purchases section |
| `scripts/smoke-test.mjs` | Modify | `/admin/packages` must deny assessors |
| `scripts/build-srs-docx.mjs` | Modify | v1.1 output name and header |
| `docs/SRS.md` | Modify | Section 10.4, matrix rows, 5.3, 11, 13, 15, 16, header |
| `docs/SRS-known-gaps.md` | Modify | Item 8 (answer-save fix), gap 3 update, header, change log |
| `docs/Galaxy_CMMC_Portal_SRS_v1.1.docx` | Create (generated) | Word export; v1.0 file removed |
| `README.md` | Modify | Migration 023 row, SRS v1.1 references |

---

# Chunk 1 — Foundation

## Task 1: Migration `023_licensing.sql`

**Files:**
- Create: `supabase/migrations/023_licensing.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Client licensing and packages.
--
-- packages is the admin-editable catalog (at most one active package per
-- type). client_licenses is the append-only purchase ledger: one row per
-- purchase, never deleted by the app; the only in-place mutations are voiding
-- (voided_at / void_reason) and the cron's expiry_reminded_at stamp.
-- Entitlement is derived in lib/licensing.ts from the client's latest
-- non-voided ledger row — nothing is stored on clients.

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('single', 'additional', 'unlimited')),
  price_usd numeric(10,2) not null default 0 check (price_usd >= 0),
  duration_months integer not null check (duration_months > 0),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active package per type. Deactivating the only package of a
-- type means that type cannot be assigned until one is active again.
create unique index if not exists packages_one_active_per_type on packages (type) where is_active;

create table if not exists client_licenses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  package_id uuid not null references packages(id),
  type text not null check (type in ('single', 'additional', 'unlimited')),
  price_paid_usd numeric(10,2) not null default 0 check (price_paid_usd >= 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  granted_by uuid,
  notes text,
  assessment_id uuid references assessments(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  expiry_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create index if not exists client_licenses_client_starts on client_licenses (client_id, starts_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Reads only; all writes go through the service-role client in API routes.
-- ---------------------------------------------------------------------------
alter table packages enable row level security;
alter table client_licenses enable row level security;

create policy "packages_read_authenticated" on packages
  for select to authenticated using (true);

create policy "client_licenses_client_read" on client_licenses
  for select using (
    exists (select 1 from clients c where c.id = client_licenses.client_id and c.user_id = auth.uid())
  );

create policy "client_licenses_staff_read" on client_licenses
  for select using (
    exists (select 1 from user_roles where user_id = auth.uid() and role in ('admin', 'assessor'))
  );

-- ---------------------------------------------------------------------------
-- Seed catalog (prices 0 for the admin to set)
-- ---------------------------------------------------------------------------
insert into packages (name, type, duration_months, sort_order) values
  ('Single Assessment', 'single', 3, 1),
  ('Additional Assessment', 'additional', 3, 2),
  ('Unlimited', 'unlimited', 12, 3)
on conflict (type) where is_active do nothing;

-- ---------------------------------------------------------------------------
-- Grandfather every existing client that has at least one assessment with a
-- Single Assessment license that expires 3 months from now. Clients with no
-- assessment get nothing (entitlement 'none').
-- ---------------------------------------------------------------------------
insert into client_licenses (client_id, package_id, type, price_paid_usd, starts_at, expires_at, granted_by, notes, assessment_id)
select
  c.id,
  p.id,
  'single',
  0,
  coalesce(c.created_at, now()),
  now() + interval '3 months',
  null,
  'Grandfathered at licensing launch',
  null
from clients c
cross join (select id from packages where type = 'single' and is_active limit 1) p
where exists (select 1 from assessments a where a.client_id = c.id)
  and not exists (select 1 from client_licenses l where l.client_id = c.id);
```

- [ ] **Step 2: Apply the migration to Supabase** (SQL Editor, paste the file, run). Verify with:

```sql
select type, name, is_active from packages order by sort_order;
select count(*) as grandfathered from client_licenses where notes = 'Grandfathered at licensing launch';
```

Expected: three package rows (`single`, `additional`, `unlimited`), all active; `grandfathered` equals the number of clients that have at least one `assessments` row.

- [ ] **Step 3: Commit**

```
git add supabase/migrations/023_licensing.sql
git commit -m "feat(db): packages catalog and client_licenses ledger (023)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 2: `lib/licensing.ts` with unit tests

**Files:**
- Create: `lib/licensing.ts`
- Test: `tests/licensing.test.ts`

- [ ] **Step 1: Write the failing unit tests**

`tests/licensing.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and see it fail**

```
npx vitest run tests/licensing.test.ts
```

Expected: `FAIL tests/licensing.test.ts` with `Error: Failed to resolve import "@/lib/licensing"` (module does not exist yet). 0 passed.

- [ ] **Step 3: Write `lib/licensing.ts`**

```ts
import { NextResponse } from "next/server";
import type { createServiceSupabaseClient } from "@/lib/supabase-server";

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

/** "December 25, 2026" */
export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** "Dec 25, 2026" */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** List-column label such as "Active, Dec 25, 2026" / "Expired, Sep 1, 2026" / "None". */
export function entitlementSummary(entitlement: Entitlement): { label: string; color: string } {
  if (entitlement.status === "active") return { label: `Active, ${formatShortDate(entitlement.expiresAt)}`, color: "#4DFFA0" };
  if (entitlement.status === "expired") return { label: `Expired, ${formatShortDate(entitlement.expiresAt)}`, color: "#F87171" };
  return { label: "None", color: "rgba(255,255,255,0.3)" };
}
```

- [ ] **Step 4: Run the test and see it pass**

```
npx vitest run tests/licensing.test.ts
```

Expected: `✓ tests/licensing.test.ts (25 tests)`, `Tests  25 passed (25)`.

- [ ] **Step 5: Commit**

```
git add lib/licensing.ts tests/licensing.test.ts
git commit -m "feat: licensing entitlement rules and readers (lib/licensing.ts)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 3: `lib/reassessment.ts` and the reassess route refactor

**Files:**
- Create: `lib/reassessment.ts`
- Modify: `app/api/admin/assessment/[id]/reassess/route.ts` (whole file, lines 1–131)
- Test: none new (behavior is covered by Task 14's start-cycle tests and manually by the admin Start Reassessment button); `npx tsc --noEmit` must pass.

- [ ] **Step 1: Write `lib/reassessment.ts`**

```ts
import type { createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReassessmentStartedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

type Svc = ReturnType<typeof createServiceSupabaseClient>;

export type StartReassessmentCycleInput = {
  svc: Svc;
  clientId: string;
  previousAssessmentId: string;
  actorUserId: string;
  actorRole: "admin" | "assessor" | "client";
  /** Send sendReassessmentStartedEmail to the client (fire and forget). */
  notifyClient: boolean;
};

export type StartReassessmentCycleResult =
  | { ok: true; assessmentId: string; controlsCarried: number }
  | { ok: false; status: 400 | 404 | 500; error: string };

/**
 * Opens a new in_progress assessment cycle for a client whose previous cycle is
 * finalized, carrying the previous control responses forward. Shared by the
 * admin/assessor reassess route, the admin license-assign route and the client
 * start-cycle route.
 */
export async function startReassessmentCycle(input: StartReassessmentCycleInput): Promise<StartReassessmentCycleResult> {
  const { svc, clientId, previousAssessmentId, actorUserId, actorRole, notifyClient } = input;

  const { data: previousAssessment } = await svc
    .from("assessments")
    .select("id, client_id, status")
    .eq("id", previousAssessmentId)
    .single();

  if (!previousAssessment || previousAssessment.client_id !== clientId) {
    return { ok: false, status: 404, error: "Assessment not found" };
  }
  if (previousAssessment.status !== "finalized") {
    return { ok: false, status: 400, error: "Only a finalized assessment can be reassessed" };
  }

  // Guard against double-starting: this must still be the client's current (latest, non-archived) cycle.
  const { data: latest } = await svc
    .from("assessments")
    .select("id")
    .eq("client_id", clientId)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (latest?.id !== previousAssessmentId) {
    return { ok: false, status: 400, error: "A newer assessment cycle already exists for this client" };
  }

  const { data: newAssessment, error: insertError } = await svc
    .from("assessments")
    .insert({
      client_id: clientId,
      status: "in_progress",
      previous_assessment_id: previousAssessmentId,
    })
    .select("id")
    .single();

  if (insertError || !newAssessment) {
    return { ok: false, status: 500, error: insertError?.message ?? "Failed to create assessment" };
  }

  // Carry forward the client's previous control responses.
  const { data: previousResponses, error: responsesError } = await svc
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", previousAssessmentId);

  if (responsesError) {
    return { ok: false, status: 500, error: responsesError.message };
  }

  if (previousResponses && previousResponses.length > 0) {
    const carriedRows = previousResponses.map((r) => ({
      assessment_id: newAssessment.id,
      control_id: r.control_id,
      response: r.response,
      notes: r.notes,
      no_artifacts: r.no_artifacts,
      no_policy_document: r.no_policy_document,
      no_implementation_artifact: r.no_implementation_artifact,
    }));
    const { error: copyError } = await svc.from("assessment_responses").insert(carriedRows);
    if (copyError) {
      return { ok: false, status: 500, error: copyError.message };
    }
  }

  const controlsCarried = previousResponses?.length ?? 0;

  logAudit({
    actorId: actorUserId,
    actorRole,
    action: "assessment.reassessment_started",
    entityType: "assessment",
    entityId: newAssessment.id,
    metadata: { previousAssessmentId, clientId, controlsCarried },
  });

  if (notifyClient) {
    const { data: clientRecord } = await svc
      .from("clients")
      .select("contact_name, company_name, user_id")
      .eq("id", clientId)
      .single();

    if (clientRecord) {
      const { data: authUser } = await svc.auth.admin.getUserById(clientRecord.user_id);
      if (authUser?.user?.email) {
        sendReassessmentStartedEmail({
          clientEmail: authUser.user.email,
          clientName: clientRecord.contact_name,
          companyName: clientRecord.company_name,
        }).catch(() => {});
      }
    }
  }

  return { ok: true, assessmentId: newAssessment.id, controlsCarried };
}
```

- [ ] **Step 2: Replace `app/api/admin/assessment/[id]/reassess/route.ts` with the thin wrapper**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { startReassessmentCycle } from "@/lib/reassessment";

// POST /api/admin/assessment/[id]/reassess
// Starts a new assessment cycle for the client, carrying forward their
// previous control responses so only changed controls need to be re-touched.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  const { data: role } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!["admin", "assessor"].includes(role?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: previousAssessment } = await svc
    .from("assessments")
    .select("id, client_id")
    .eq("id", params.id)
    .single();

  if (!previousAssessment) {
    return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  }

  const result = await startReassessmentCycle({
    svc,
    clientId: previousAssessment.client_id,
    previousAssessmentId: params.id,
    actorUserId: user.id,
    actorRole: (role?.role ?? "assessor") as "admin" | "assessor",
    notifyClient: true,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true, assessmentId: result.assessmentId });
}
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```

Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```
git add lib/reassessment.ts "app/api/admin/assessment/[id]/reassess/route.ts"
git commit -m "refactor: extract startReassessmentCycle into lib/reassessment.ts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 4: Three licensing emails

**Files:**
- Modify: `lib/email.ts` (append after line 246, the end of `sendReassessmentStartedEmail`)
- Test: none (senders are mocked in route tests; `npx tsc --noEmit` must pass)

- [ ] **Step 1: Append to `lib/email.ts`**

```ts

// ---------------------------------------------------------------------------
// 7. Client notification: a package was assigned (license activated)
// ---------------------------------------------------------------------------
export async function sendPackageAssignedEmail(params: {
  clientEmail: string;
  clientName: string;
  companyName: string;
  packageName: string;
  packageType: "single" | "additional" | "unlimited";
  /** Long date, e.g. "December 25, 2026" */
  expiresOn: string;
  /** True when the assignment opened a new assessment cycle. */
  cycleOpened: boolean;
}) {
  const { clientEmail, clientName, companyName, packageName, packageType, expiresOn, cycleOpened } = params;
  const allows = packageType === "unlimited"
    ? "lets you run assessments as often as you like"
    : "lets you submit one assessment";

  const html = baseTemplate(`
    ${heading("Package Activated")}
    ${para(`Hi ${clientName},`)}
    ${para(`Galaxy Consulting has activated the <strong style="color:#fff;">${packageName}</strong> package for <strong style="color:#fff;">${companyName}</strong>. It ${allows} until <strong style="color:#fff;">${expiresOn}</strong>.`)}
    ${divider()}
    <div style="margin-bottom:16px;">${badge("Active", "#4DFFA0")}</div>
    ${para(cycleOpened
      ? "A new assessment cycle has been opened for you. Your previous answers have been carried forward — you only need to update the controls that have changed since your last assessment."
      : "Log in to your portal to continue your assessment.")}
    ${ctaButton("Go to Your Dashboard →", `${APP_URL}/portal/dashboard`)}
  `);

  await send(clientEmail, `[Galaxy] Package Activated: ${packageName}`, html);
}

// ---------------------------------------------------------------------------
// 8. Client + admin notification: license expires in 14 days
// ---------------------------------------------------------------------------
export async function sendLicenseExpiringEmail(params: {
  clientEmail: string;
  clientName: string;
  companyName: string;
  packageName: string;
  /** Long date, e.g. "December 25, 2026" */
  expiresOn: string;
}) {
  const { clientEmail, clientName, companyName, packageName, expiresOn } = params;

  const clientHtml = baseTemplate(`
    ${heading("Your Package Expires Soon")}
    ${para(`Hi ${clientName},`)}
    ${para(`The <strong style="color:#fff;">${packageName}</strong> package for <strong style="color:#fff;">${companyName}</strong> expires on <strong style="color:#fff;">${expiresOn}</strong>.`)}
    ${divider()}
    <div style="margin-bottom:16px;">${badge("Expires Soon", "#FFB347")}</div>
    ${para("After that date you keep access to your portal, past answers and reports, but you cannot edit your assessment until a new package is assigned. To continue, request a package from your dashboard or contact Galaxy Consulting.")}
    ${ctaButton("Request a Package →", `${APP_URL}/portal/dashboard`)}
  `);
  await send(clientEmail, `[Galaxy] Your ${packageName} package expires ${expiresOn}`, clientHtml);

  if (!ADMIN_EMAIL) return;
  const adminHtml = baseTemplate(`
    ${heading("Client Package Expiring")}
    ${para(`The <strong style="color:#fff;">${packageName}</strong> package for <strong style="color:#fff;">${companyName}</strong> expires on <strong style="color:#fff;">${expiresOn}</strong>. The client has been notified.`)}
    ${divider()}
    <div style="margin-bottom:16px;">${badge("Expires Soon", "#FFB347")}</div>
    ${para("Reach out to arrange a renewal, then record the purchase on the client's page to keep their access uninterrupted.", true)}
  `);
  await send(ADMIN_EMAIL, `[Galaxy] ${companyName} — package expires ${expiresOn}`, adminHtml);
}

// ---------------------------------------------------------------------------
// 9. Admin notification: client requested a package
// ---------------------------------------------------------------------------
export async function sendPackageRequestEmail(params: {
  companyName: string;
  contactName: string;
  clientId: string;
  packageName: string;
  priceUsd: number;
  message: string | null;
}) {
  if (!ADMIN_EMAIL) return;
  const { companyName, contactName, clientId, packageName, priceUsd, message } = params;
  const url = `${APP_URL}/admin/clients/${clientId}`;

  const html = baseTemplate(`
    ${heading("Package Request")}
    ${para(`<strong style="color:#fff;">${contactName}</strong> from <strong style="color:#fff;">${companyName}</strong> has requested a package.`)}
    ${divider()}
    <div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Requested</div>
    <div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:16px;">${packageName} — $${priceUsd.toFixed(2)}</div>
    ${message
      ? `<div style="margin-bottom:8px;font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;">Message</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.7;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:14px;">${message.replace(/\n/g, "<br/>")}</div>`
      : ""}
    ${para("Record the purchase on the client's page once payment is arranged.", true)}
    ${ctaButton("Open Client in Admin Portal →", url)}
  `);

  await send(ADMIN_EMAIL, `[Galaxy] ${companyName} — Package Request: ${packageName}`, html);
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```
git add lib/email.ts
git commit -m "feat(email): package assigned, license expiring, package request" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 5: `GET /api/assessment` gains `previousResponses` and `entitlement`

**Files:**
- Modify: `app/api/assessment/route.ts` (imports line 2; GET lines 22–55)
- Test: none new (read-only additions; `npx tsc --noEmit` must pass). Task 7's tests import this module and exercise POST.

- [ ] **Step 1: Add the import** — after line 2 (`import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";`) add:

```ts
import { getEntitlement } from "@/lib/licensing";
```

- [ ] **Step 2: Replace the GET body from the "Look for any non-archived assessment" comment (line 22) through the closing `}` of GET (line 56)** with:

```ts
  // Look for any non-archived assessment for this client
  let { data: assessment } = await supabase
    .from("assessments")
    .select("id, status, previous_assessment_id")
    .eq("client_id", clientId)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  // Create a client's very first assessment automatically. It is an empty cycle
  // the client cannot edit until a license is assigned. Once an assessment is
  // finalized, the next cycle starts when an admin/assessor kicks off a
  // reassessment, when a license assignment opens one, or when an Unlimited
  // client starts one — all through lib/reassessment.ts.
  if (!assessment) {
    const { data: newAssessment, error } = await supabase
      .from("assessments")
      .insert({ client_id: clientId, status: "in_progress" })
      .select("id, status, previous_assessment_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assessment = newAssessment;
  }

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact")
    .eq("assessment_id", assessment!.id);

  // Previous cycle's answers, shown as a muted reference on each control.
  let previousResponses: { control_id: string; response: string }[] = [];
  const previousAssessmentId = (assessment as { previous_assessment_id?: string | null }).previous_assessment_id ?? null;
  if (previousAssessmentId) {
    const { data: prev } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", previousAssessmentId);
    previousResponses = prev ?? [];
  }

  const entitlement = await getEntitlement(supabase, clientId);

  return NextResponse.json({
    assessmentId: assessment!.id,
    assessmentStatus: assessment!.status,
    responses: responses || [],
    previousResponses,
    entitlement,
  });
}
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```

Expected: no output (exit code 0).

- [ ] **Step 4: Commit**

```
git add app/api/assessment/route.ts
git commit -m "feat(api): GET /api/assessment returns previousResponses and entitlement" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 6: Route-test harness `tests/helpers/fake-supabase.ts`

**Files:**
- Create: `tests/helpers/fake-supabase.ts` (not collected by Vitest — `vitest.config.ts` includes only `tests/**/*.test.ts` — but type-checked by `next build`)
- Test: consumed by Task 7 and Task 14

- [ ] **Step 1: Write the helper**

```ts
/**
 * In-memory stand-in for the supabase-js client, covering exactly the query
 * surface the gated routes and lib/licensing.ts use:
 *
 *   from(table).select(cols).eq/neq/not/is/in/gt/lte/order/limit/single/maybeSingle
 *   from(table).insert(rows).select(cols).single()
 *   from(table).upsert(row, { onConflict })
 *   from(table).update(patch).eq(...)
 *   from(table).delete().eq(...)
 *   auth.admin.getUserById(id)
 *
 * Embedded many-to-one selects such as `clients(user_id)` are resolved through
 * RELATIONS. Every builder is a thenable, so `await svc.from(...)...` works.
 */
export type Row = Record<string, unknown>;

export type FakeState = {
  user: { id: string } | null;
  tables: Record<string, Row[]>;
  users: { id: string; email: string }[];
};

const RELATIONS: Record<string, Record<string, { table: string; localKey: string }>> = {
  assessments: { clients: { table: "clients", localKey: "client_id" } },
  artifacts: { assessments: { table: "assessments", localKey: "assessment_id" } },
  client_licenses: {
    packages: { table: "packages", localKey: "package_id" },
    clients: { table: "clients", localKey: "client_id" },
  },
  documents: { clients: { table: "clients", localKey: "client_id" } },
};

/** Column defaults the database would apply on insert. */
const DEFAULTS: Record<string, () => Row> = {
  assessments: () => ({ status: "in_progress", started_at: new Date().toISOString() }),
};

function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function project(state: FakeState, table: string, row: Row, select: string): Row {
  const out: Row = { ...row };
  for (const part of splitTopLevel(select)) {
    const match = part.match(/^(\w+)\(([\s\S]*)\)$/);
    if (!match) continue;
    const rel = RELATIONS[table]?.[match[1]];
    if (!rel) {
      out[match[1]] = null;
      continue;
    }
    const target = (state.tables[rel.table] ?? []).find((r) => r.id === row[rel.localKey]);
    out[match[1]] = target ? project(state, rel.table, target, match[2]) : null;
  }
  return out;
}

type Filter = (row: Row) => boolean;

export type FakeResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflictKeys: string[] = ["id"];
  private columns = "*";
  private returning = false;
  private ordering: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private headOnly = false;

  constructor(private state: FakeState, private table: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    this.columns = columns;
    this.returning = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; this.returning = false; return this; }
  upsert(row: Row, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = row;
    this.conflictKeys = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    this.returning = false;
    return this;
  }
  update(patch: Row) { this.op = "update"; this.payload = patch; this.returning = false; return this; }
  delete() { this.op = "delete"; this.returning = false; return this; }

  eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => r[column] !== value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === "eq") this.filters.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: unknown) { this.filters.push((r) => (r[column] ?? null) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.includes(r[column])); return this; }
  gt(column: string, value: string) { this.filters.push((r) => String(r[column]) > value); return this; }
  lte(column: string, value: string) { this.filters.push((r) => String(r[column]) <= value); return this; }
  order(column: string, opts?: { ascending?: boolean }) {
    this.ordering = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    if (!this.state.tables[this.table]) this.state.tables[this.table] = [];
    return this.state.tables[this.table];
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => f(r)));
  }

  private finish(rows: Row[]): FakeResult {
    const projected = rows.map((r) => project(this.state, this.table, r, this.columns));
    if (this.mode === "single") {
      if (projected.length !== 1) {
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      }
      return { data: projected[0], error: null };
    }
    if (this.mode === "maybe") return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }

  private run(): FakeResult {
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload as Row]).map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(DEFAULTS[this.table]?.() ?? {}),
        ...r,
      }));
      this.rows().push(...list);
      return this.returning ? this.finish(list) : { data: null, error: null };
    }
    if (this.op === "upsert") {
      const row = this.payload as Row;
      const existing = this.rows().find((r) => this.conflictKeys.every((k) => r[k] === row[k]));
      if (existing) Object.assign(existing, row);
      else this.rows().push({ id: crypto.randomUUID(), ...row });
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const hit = this.matching();
      for (const r of hit) Object.assign(r, this.payload as Row);
      return this.returning ? this.finish(hit) : { data: null, error: null };
    }
    if (this.op === "delete") {
      this.state.tables[this.table] = this.rows().filter((r) => !this.filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    let hit = this.matching();
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      hit = [...hit].sort((a, b) => {
        const av = String(a[column]);
        const bv = String(b[column]);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.max !== null) hit = hit.slice(0, this.max);
    if (this.headOnly) return { data: null, error: null, count: hit.length };
    return this.finish(hit);
  }
}

export function createFakeClient(state: FakeState) {
  return {
    from: (table: string) => new FakeQuery(state, table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: state.users.find((u) => u.id === id) ?? null },
          error: null,
        }),
      },
    },
  };
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no output (exit code 0).

- [ ] **Step 3: Commit**

```
git add tests/helpers/fake-supabase.ts
git commit -m "test: in-memory Supabase stand-in for route handler tests" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Chunk 2 — Enforcement on client write routes (after chunk 1; parallel with 3, 5)

## Task 7: Route tests and gates for answer save, submit, artifact upload, scoping

**Files:**
- Create: `tests/license-gates.test.ts`
- Modify: `app/api/assessment/route.ts` (imports; POST lines 59–89)
- Modify: `app/api/assessment/submit/route.ts` (imports; after the status check, line 42)
- Modify: `app/api/artifacts/route.ts` (imports; POST after line 134; DELETE after line 242)
- Modify: `app/api/scoping/route.ts` (`authorizeAssessment` lines 4–19; POST after line 59)
- Test: `tests/license-gates.test.ts`

- [ ] **Step 1: Write the failing route tests**

`tests/license-gates.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FakeState, Row } from "./helpers/fake-supabase";

// Hoisted so the vi.mock factories below can reach it when the mocked modules
// are first imported.
const state = vi.hoisted(() => ({
  current: { user: null, tables: {}, users: [] } as {
    user: { id: string } | null;
    tables: Record<string, Record<string, unknown>[]>;
    users: { id: string; email: string }[];
  },
}));

vi.mock("@/lib/supabase-server", async () => {
  const { createFakeClient } = await import("./helpers/fake-supabase");
  return {
    createServerSupabaseClient: () => ({
      auth: { getUser: async () => ({ data: { user: state.current.user } }) },
    }),
    createServiceSupabaseClient: () => createFakeClient(state.current as FakeState),
  };
});
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({
  sendAssessmentSubmittedEmail: vi.fn(async () => {}),
  sendReassessmentStartedEmail: vi.fn(async () => {}),
}));
vi.mock("@/lib/run-assessment-review", () => ({
  runAssessmentReview: vi.fn(async () => ({ runId: "run-1", total: 0 })),
  executeReviewRun: vi.fn(async () => {}),
}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      createBucket: async () => ({ data: null, error: null }),
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/signed" } }),
      }),
    },
  }),
}));

import { POST as saveAnswer } from "@/app/api/assessment/route";
import { POST as submitAssessment } from "@/app/api/assessment/submit/route";
import { POST as uploadArtifact } from "@/app/api/artifacts/route";
import { POST as saveScoping } from "@/app/api/scoping/route";

// ---------------------------------------------------------------- fixture

const OWNER = "user-owner";
const OTHER = "user-other";
const ADMIN = "user-admin";
const CLIENT_ID = "client-1";
const OTHER_CLIENT_ID = "client-2";
const ASSESSMENT_ID = "assess-1";

function seed(opts: {
  license: "active" | "expired" | "none";
  licenseType?: "single" | "unlimited";
  assessmentStatus?: string;
}) {
  const now = Date.now();
  const day = 86400000;
  const type = opts.licenseType ?? "single";
  const licenses: Row[] = opts.license === "none" ? [] : [{
    id: "lic-1",
    client_id: CLIENT_ID,
    package_id: type === "unlimited" ? "pkg-unlimited" : "pkg-single",
    type,
    price_paid_usd: 0,
    starts_at: new Date(now - 30 * day).toISOString(),
    expires_at: opts.license === "active"
      ? new Date(now + 60 * day).toISOString()
      : new Date(now - day).toISOString(),
    voided_at: null,
  }];
  state.current.tables = {
    user_roles: [
      { user_id: OWNER, role: "client" },
      { user_id: OTHER, role: "client" },
      { user_id: ADMIN, role: "admin" },
    ],
    clients: [
      { id: CLIENT_ID, user_id: OWNER, company_name: "Owner Co", contact_name: "Olive Owner", cmmc_target_level: 2 },
      { id: OTHER_CLIENT_ID, user_id: OTHER, company_name: "Other Co", contact_name: "Otto Other", cmmc_target_level: 2 },
    ],
    assessments: [{
      id: ASSESSMENT_ID,
      client_id: CLIENT_ID,
      status: opts.assessmentStatus ?? "in_progress",
      started_at: new Date(now - day).toISOString(),
      previous_assessment_id: null,
    }],
    assessment_responses: [],
    artifacts: [],
    assessment_scoping: [],
    packages: [
      { id: "pkg-single", name: "Single Assessment", type: "single", price_usd: 0, duration_months: 3, is_active: true, sort_order: 1 },
      { id: "pkg-unlimited", name: "Unlimited", type: "unlimited", price_usd: 0, duration_months: 12, is_active: true, sort_order: 3 },
    ],
    client_licenses: licenses,
  };
  state.current.users = [
    { id: OWNER, email: "owner@example.test" },
    { id: OTHER, email: "other@example.test" },
    { id: ADMIN, email: "admin@example.test" },
  ];
}

function signIn(userId: string | null) {
  state.current.user = userId ? { id: userId } : null;
}

function tables() {
  return state.current.tables;
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function uploadRequest() {
  const form = new FormData();
  form.append("assessmentId", ASSESSMENT_ID);
  form.append("controlId", "3.1.1");
  form.append("artifactType", "policy");
  form.append("file", new File(["hello"], "policy.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/artifacts", { method: "POST", body: form });
}

// ------------------------------------------------------------------ tests

describe("POST /api/assessment (answer save)", () => {
  const body = { assessmentId: ASSESSMENT_ID, controlId: "3.1.1", response: "yes" };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_responses).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().assessment_responses).toHaveLength(0);
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await saveAnswer(jsonRequest("/api/assessment", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/assessment/submit", () => {
  const body = { assessmentId: ASSESSMENT_ID };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, newStatus: "submitted", reviewsQueued: 0 });
    expect(tables().assessments[0].status).toBe("submitted");
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().assessments[0].status).toBe("in_progress");
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await submitAssessment(jsonRequest("/api/assessment/submit", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/artifacts (evidence upload)", () => {
  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(200);
    expect(tables().artifacts).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().artifacts).toHaveLength(0);
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active" });
    signIn(ADMIN);
    const res = await uploadArtifact(uploadRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

describe("POST /api/scoping", () => {
  const body = { assessmentId: ASSESSMENT_ID, answers: { has_wireless: false } };

  it("allows the owning client with an active license", async () => {
    seed({ license: "active" });
    signIn(OWNER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_scoping).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired" });
    signIn(OWNER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
  });

  it("returns 403 Forbidden for another client", async () => {
    seed({ license: "active" });
    signIn(OTHER);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("allows an admin without any license (staff are never license-gated)", async () => {
    seed({ license: "none" });
    signIn(ADMIN);
    const res = await saveScoping(jsonRequest("/api/scoping", body));
    expect(res.status).toBe(200);
    expect(tables().assessment_scoping).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

```
npx vitest run tests/license-gates.test.ts
```

Expected: 16 tests collected; the four "expired license → 403 license_inactive" tests fail (routes return 200), and the answer-save "another client" and "admin" tests fail (route returns 200 because it has no ownership check). The "allowed" and the existing-ownership tests pass. Summary line: `Tests  6 failed | 10 passed (16)`.

- [ ] **Step 3: Gate `POST /api/assessment`** — in `app/api/assessment/route.ts` change the licensing import (added in Task 5) to:

```ts
import { getEntitlement, requireClientLicense } from "@/lib/licensing";
```

and replace the POST handler (from `// POST /api/assessment` to the end of the file) with:

```ts
// POST /api/assessment
// Saves one control response. Only the owning client may write, only while the
// cycle is editable, and only under an active license.
export async function POST(req: NextRequest) {
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();
  const supabase = createServiceSupabaseClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assessmentId, controlId, response, notes, no_artifacts, no_policy_document, no_implementation_artifact } = body;

  if (!assessmentId || !controlId || !response) {
    return NextResponse.json({ error: "assessmentId, controlId, response required" }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, status, client_id, clients(user_id)")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  const owner = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  if (!owner || (owner as { user_id: string }).user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (assessment.status !== "in_progress" && assessment.status !== "remediation_required") {
    return NextResponse.json({ error: "Assessment is not editable in its current state" }, { status: 400 });
  }

  const denied = await requireClientLicense(supabase, assessment.client_id as string);
  if (denied) return denied;

  const { error } = await supabase
    .from("assessment_responses")
    .upsert(
      {
        assessment_id: assessmentId,
        control_id: controlId,
        response,
        notes: notes ?? null,
        no_artifacts: no_artifacts ?? false,
        no_policy_document: no_policy_document ?? false,
        no_implementation_artifact: no_implementation_artifact ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Gate `POST /api/assessment/submit`** — add the import after line 7 (`import { getControlsForLevel } from "@/lib/controls";`):

```ts
import { requireClientLicense } from "@/lib/licensing";
```

and insert immediately after the status check block (after line 42, the `}` closing `if (assessment.status !== "in_progress" && ...)`):

```ts

  const denied = await requireClientLicense(serviceSupabase, assessment.client_id as string);
  if (denied) return denied;
```

- [ ] **Step 5: Gate `POST` and `DELETE /api/artifacts`** — add the import after line 5 (`import { logAudit } from "@/lib/audit";`):

```ts
import { requireClientLicense } from "@/lib/licensing";
```

In POST, immediately after line 134 (`if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });`) insert:

```ts

  const denied = await requireClientLicense(serviceSupabase, clientId);
  if (denied) return denied;
```

In DELETE, immediately after the ownership block that ends at line 242 (`  }` after `return NextResponse.json({ error: "Forbidden" }, { status: 403 });`) insert:

```ts

  const denied = await requireClientLicense(serviceSupabase, (assessment as { client_id: string }).client_id);
  if (denied) return denied;
```

- [ ] **Step 6: Gate `POST /api/scoping` for non-staff** — add the import after line 2:

```ts
import { requireClientLicense } from "@/lib/licensing";
```

Replace `authorizeAssessment` (lines 4–19) with:

```ts
async function authorizeAssessment(assessmentId: string, userId: string) {
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userId).single();
  const isStaff = ["admin", "assessor"].includes(role?.role ?? "");

  const { data: assessment } = await svc
    .from("assessments")
    .select("id, status, client_id, clients(user_id)")
    .eq("id", assessmentId)
    .single();
  if (!assessment) return { svc, allowed: false, isStaff, status: null as string | null, clientId: null as string | null };

  const owner = Array.isArray(assessment.clients) ? assessment.clients[0] : assessment.clients;
  const allowed = isStaff || (owner as { user_id: string } | null)?.user_id === userId;
  return { svc, allowed, isStaff, status: assessment.status as string, clientId: assessment.client_id as string };
}
```

In POST, change line 53 to destructure `clientId` too:

```ts
  const { svc, allowed, isStaff, status, clientId } = await authorizeAssessment(assessmentId, user.id);
```

and insert immediately after the editable-status block (after line 59, the `}` closing `if (!isStaff && status && ...)`):

```ts

  if (!isStaff && clientId) {
    const denied = await requireClientLicense(svc, clientId);
    if (denied) return denied;
  }
```

- [ ] **Step 7: Run the tests and see them pass**

```
npx vitest run tests/license-gates.test.ts
```

Expected: `✓ tests/license-gates.test.ts (16 tests)`, `Tests  16 passed (16)`.

- [ ] **Step 8: Run the whole suite and type-check**

```
npm test; npx tsc --noEmit
```

Expected: `Test Files  5 passed (5)`, `Tests  66 passed (66)`; tsc prints nothing.

- [ ] **Step 9: Commit**

```
git add tests/license-gates.test.ts app/api/assessment/route.ts app/api/assessment/submit/route.ts app/api/artifacts/route.ts app/api/scoping/route.ts
git commit -m "feat(api): license gates on answer save, submit, artifacts, scoping; answer save now checks ownership and status" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 8: Gates on information-request responses and the document library

**Files:**
- Modify: `app/api/info-requests/[id]/respond/route.ts` (imports; after line 42)
- Modify: `app/api/documents/route.ts` (imports; GET lines 44–62; POST after line 84; DELETE after line 150)
- Modify: `app/api/documents/links/route.ts` (`authorize` lines 5–20; POST line 38–39)
- Modify: `app/api/documents/analyze/route.ts` (imports; after line 63)
- Test: none new — these routes need storage, Anthropic or e-mail side effects that the harness does not model. `npx tsc --noEmit` and `npm test` must pass.

- [ ] **Step 1: `app/api/info-requests/[id]/respond/route.ts`** — add after line 3 (`import { sendInfoRequestResponseEmail } from "@/lib/email";`):

```ts
import { requireClientLicense } from "@/lib/licensing";
```

Insert immediately after the ownership block ending at line 42 (`  }` after `return NextResponse.json({ error: "Forbidden" }, { status: 403 });`):

```ts

  const denied = await requireClientLicense(svc, client.id);
  if (denied) return denied;
```

- [ ] **Step 2: `app/api/documents/route.ts`** — add after line 6 (`import { logAudit } from "@/lib/audit";`):

```ts
import { getEntitlement, requireClientLicense } from "@/lib/licensing";
```

In GET, replace lines 44–62 (from `const { data: docs, error } = await svc` through `return NextResponse.json({ documents });`) with:

```ts
  const { data: docs, error } = await svc
    .from("documents")
    .select("id, file_name, title, doc_type, file_size, mime_type, uploaded_at, storage_path, sha256, document_control_links(id, control_id, status, source, confidence, rationale)")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const storage = getStorageClient();
  const documents = await Promise.all(
    (docs ?? []).map(async ({ storage_path, ...d }) => {
      const { data: signed } = await storage.storage
        .from(BUCKET)
        .createSignedUrl(storage_path, 3600);
      return { ...d, signedUrl: signed?.signedUrl ?? "" };
    })
  );

  // The portal Documents page disables its edit controls from this.
  const entitlement = isStaff ? null : await getEntitlement(svc, clientId);

  return NextResponse.json({ documents, entitlement });
```

In POST, insert immediately after line 84 (`if (!clientId) return NextResponse.json({ error: "No client record" }, { status: 403 });`):

```ts

  if (!isStaff) {
    const denied = await requireClientLicense(svc, clientId);
    if (denied) return denied;
  }
```

In DELETE, insert immediately after the ownership block ending at line 150 (`  }` after `return NextResponse.json({ error: "Forbidden" }, { status: 403 });`):

```ts

  if (!isStaff) {
    const denied = await requireClientLicense(svc, doc.client_id as string);
    if (denied) return denied;
  }
```

- [ ] **Step 3: `app/api/documents/links/route.ts`** — add after line 3 (`import { CONTROLS } from "@/lib/controls";`):

```ts
import { requireClientLicense } from "@/lib/licensing";
```

Replace `authorize` (lines 5–20) with:

```ts
async function authorize(documentId: string, userId: string) {
  const svc = createServiceSupabaseClient();
  const { data: role } = await svc.from("user_roles").select("role").eq("user_id", userId).single();
  const isStaff = ["admin", "assessor"].includes(role?.role ?? "");

  const { data: doc } = await svc
    .from("documents")
    .select("id, client_id, clients(user_id)")
    .eq("id", documentId)
    .single();
  if (!doc) return { svc, allowed: false, isStaff, clientId: null as string | null };

  const owner = Array.isArray(doc.clients) ? doc.clients[0] : doc.clients;
  const allowed = isStaff || (owner as { user_id: string } | null)?.user_id === userId;
  return { svc, allowed, isStaff, clientId: doc.client_id as string };
}
```

Replace lines 38–39 (`const { svc, allowed, isStaff } = await authorize(...)` and the Forbidden line) with:

```ts
  const { svc, allowed, isStaff, clientId } = await authorize(documentId, user.id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isStaff && clientId) {
    const denied = await requireClientLicense(svc, clientId);
    if (denied) return denied;
  }
```

- [ ] **Step 4: `app/api/documents/analyze/route.ts`** — add after line 6 (`import { CONTROLS } from "@/lib/controls";`):

```ts
import { requireClientLicense } from "@/lib/licensing";
```

Insert immediately after the ownership block ending at line 63 (`  }` after `return NextResponse.json({ error: "Forbidden" }, { status: 403 });`):

```ts

  if (!isStaff) {
    const denied = await requireClientLicense(svc, doc.client_id as string);
    if (denied) return denied;
  }
```

- [ ] **Step 5: Verify**

```
npx tsc --noEmit; npm test
```

Expected: tsc prints nothing; `Tests  66 passed (66)`.

- [ ] **Step 6: Commit**

```
git add "app/api/info-requests/[id]/respond/route.ts" app/api/documents/route.ts app/api/documents/links/route.ts app/api/documents/analyze/route.ts
git commit -m "feat(api): license gates on info-request responses and the document library" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Chunk 3 — Admin API and admin UI (after chunk 1; parallel with 2, 4, 5)

## Task 9: Package catalog API `GET/POST/PUT /api/admin/packages`

**Files:**
- Create: `app/api/admin/packages/route.ts`
- Test: none automated (admin routes are exercised by the Packages page and `npm run build`); manual check in Step 3.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

const PACKAGE_TYPES = ["single", "additional", "unlimited"];
const PACKAGE_COLUMNS = "id, name, type, price_usd, duration_months, description, is_active, sort_order, created_at, updated_at";
const UNIQUE_VIOLATION = "23505";

function parsePrice(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function parseDuration(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/admin/packages — the whole catalog, active or not, in display order
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.svc
    .from("packages")
    .select(PACKAGE_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ packages: data ?? [] });
}

// POST /api/admin/packages { name, type, priceUsd, durationMonths, description?, isActive?, sortOrder? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const price = parsePrice(body.priceUsd ?? 0);
  const duration = parseDuration(body.durationMonths);
  const isActive = body.isActive !== false;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!PACKAGE_TYPES.includes(type)) return NextResponse.json({ error: "type must be single, additional or unlimited" }, { status: 400 });
  if (price === null) return NextResponse.json({ error: "priceUsd must be 0 or more" }, { status: 400 });
  if (duration === null) return NextResponse.json({ error: "durationMonths must be a whole number greater than 0" }, { status: 400 });

  if (isActive) {
    const { data: existing } = await svc.from("packages").select("id").eq("type", type).eq("is_active", true).maybeSingle();
    if (existing) return NextResponse.json({ error: "An active package of this type already exists" }, { status: 409 });
  }

  const { data, error } = await svc
    .from("packages")
    .insert({
      name,
      type,
      price_usd: price,
      duration_months: duration,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      is_active: isActive,
      sort_order: Number.isInteger(body.sortOrder) ? body.sortOrder : 0,
    })
    .select(PACKAGE_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return NextResponse.json({ error: "An active package of this type already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ package: data });
}

// PUT /api/admin/packages { id, name?, priceUsd?, durationMonths?, description?, isActive?, sortOrder? }
// Package type is not editable.
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updates.name = name;
  }
  if (body.priceUsd !== undefined) {
    const price = parsePrice(body.priceUsd);
    if (price === null) return NextResponse.json({ error: "priceUsd must be 0 or more" }, { status: 400 });
    updates.price_usd = price;
  }
  if (body.durationMonths !== undefined) {
    const duration = parseDuration(body.durationMonths);
    if (duration === null) return NextResponse.json({ error: "durationMonths must be a whole number greater than 0" }, { status: 400 });
    updates.duration_months = duration;
  }
  if (body.description !== undefined) {
    updates.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
  }
  if (body.isActive !== undefined) updates.is_active = !!body.isActive;
  if (body.sortOrder !== undefined) {
    if (!Number.isInteger(body.sortOrder)) return NextResponse.json({ error: "sortOrder must be a whole number" }, { status: 400 });
    updates.sort_order = body.sortOrder;
  }

  const { data, error } = await svc
    .from("packages")
    .update(updates)
    .eq("id", body.id)
    .select(PACKAGE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return NextResponse.json({ error: "Another package of this type is already active" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  return NextResponse.json({ package: data });
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manual check** — with `npm run dev` running and signed in as admin in the browser, open `http://localhost:3000/api/admin/packages`. Expected: `{"packages":[...]}` with the three seeded rows ordered `single`, `additional`, `unlimited`.

- [ ] **Step 4: Commit**

```
git add app/api/admin/packages/route.ts
git commit -m "feat(api): admin package catalog GET/POST/PUT" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 10: Client licenses API — `GET/POST /api/admin/clients/[id]/licenses` and `POST /api/admin/licenses/[id]/void`

**Files:**
- Create: `app/api/admin/clients/[id]/licenses/route.ts`
- Create: `app/api/admin/licenses/[id]/void/route.ts`
- Test: none automated; manual check in Step 4.

- [ ] **Step 1: Write `app/api/admin/clients/[id]/licenses/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAdminOrAssessor } from "@/lib/auth-helpers";
import {
  addMonths,
  computeEntitlement,
  formatLongDate,
  getEntitlement,
  hasPriorLicense,
  loadLicenseContext,
  planAssignment,
  type LicenseType,
} from "@/lib/licensing";
import { startReassessmentCycle } from "@/lib/reassessment";
import { sendPackageAssignedEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

const LEDGER_COLUMNS = "id, package_id, type, price_paid_usd, starts_at, expires_at, granted_by, notes, assessment_id, voided_at, void_reason, created_at, packages(name)";

type LedgerRow = {
  id: string;
  package_id: string;
  type: LicenseType;
  price_paid_usd: number | string;
  starts_at: string;
  expires_at: string;
  granted_by: string | null;
  notes: string | null;
  assessment_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  packages: { name: string } | { name: string }[] | null;
};

function packageName(row: LedgerRow): string {
  const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
  return pkg?.name ?? "";
}

// GET /api/admin/clients/[id]/licenses
// Ledger rows with package name and granter email, the computed entitlement,
// the latest cycle, and every active package with its assignment plan.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminOrAssessor();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { svc } = auth;

  const { data: client } = await svc.from("clients").select("id").eq("id", params.id).single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const { data: rows, error } = await svc
    .from("client_licenses")
    .select(LEDGER_COLUMNS)
    .eq("client_id", params.id)
    .order("starts_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ledger = (rows ?? []) as unknown as LedgerRow[];

  const granterEmails = new Map<string, string>();
  for (const r of ledger) {
    if (!r.granted_by || granterEmails.has(r.granted_by)) continue;
    const { data: authUser } = await svc.auth.admin.getUserById(r.granted_by);
    granterEmails.set(r.granted_by, authUser?.user?.email ?? "");
  }

  const { licenses, latestAssessment } = await loadLicenseContext(svc, params.id);
  const entitlement = computeEntitlement(licenses, latestAssessment, new Date());
  const prior = hasPriorLicense(licenses);

  const { data: packages } = await svc
    .from("packages")
    .select("id, name, type, price_usd, duration_months, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const assignablePackages = (packages ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    type: p.type as LicenseType,
    price_usd: Number(p.price_usd),
    duration_months: p.duration_months as number,
    description: (p.description as string | null) ?? null,
    plan: planAssignment({ packageType: p.type as LicenseType, hasPriorLicense: prior, latestAssessment }),
  }));

  return NextResponse.json({
    licenses: ledger.map((r) => ({
      id: r.id,
      packageId: r.package_id,
      packageName: packageName(r),
      type: r.type,
      pricePaidUsd: Number(r.price_paid_usd),
      startsAt: r.starts_at,
      expiresAt: r.expires_at,
      grantedBy: r.granted_by,
      grantedByEmail: r.granted_by ? granterEmails.get(r.granted_by) ?? null : null,
      notes: r.notes,
      assessmentId: r.assessment_id,
      voidedAt: r.voided_at,
      voidReason: r.void_reason,
    })),
    entitlement,
    latestAssessment,
    assignablePackages,
  });
}

// POST /api/admin/clients/[id]/licenses { packageId, pricePaidUsd, notes }
// Records an offline purchase, which activates the license.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, svc } = auth;

  const body = await req.json();
  const { packageId, pricePaidUsd, notes } = body;
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });
  const price = Number(pricePaidUsd ?? 0);
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "pricePaidUsd must be 0 or more" }, { status: 400 });
  }

  const { data: client } = await svc
    .from("clients")
    .select("id, company_name, contact_name, user_id")
    .eq("id", params.id)
    .single();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // 1. Load the package. It must be active.
  const { data: pkg } = await svc
    .from("packages")
    .select("id, name, type, duration_months, is_active")
    .eq("id", packageId)
    .single();
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!pkg.is_active) return NextResponse.json({ error: "Package is not active" }, { status: 400 });

  // 2. Load the ledger and latest cycle. 3. Plan.
  const { licenses, latestAssessment } = await loadLicenseContext(svc, params.id);
  const plan = planAssignment({
    packageType: pkg.type as LicenseType,
    hasPriorLicense: hasPriorLicense(licenses),
    latestAssessment,
  });
  if (!plan.allowed) return NextResponse.json({ error: plan.reason }, { status: 400 });

  // 4. Open or reuse a cycle.
  let assessmentId: string | null = null;
  if (plan.cycleAction === "open") {
    const result = await startReassessmentCycle({
      svc,
      clientId: params.id,
      previousAssessmentId: plan.previousAssessmentId,
      actorUserId: user.id,
      actorRole: "admin",
      notifyClient: false,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    assessmentId = result.assessmentId;
  } else if (plan.cycleAction === "reuse") {
    assessmentId = plan.assessmentId;
  }

  // 5. Insert the ledger row. The clock starts now; nothing stacks.
  const now = new Date();
  const startsAt = now.toISOString();
  const expiresAt = addMonths(now, pkg.duration_months as number).toISOString();
  const cleanNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  const { data: license, error: insertError } = await svc
    .from("client_licenses")
    .insert({
      client_id: params.id,
      package_id: pkg.id,
      type: pkg.type,
      price_paid_usd: Math.round(price * 100) / 100,
      starts_at: startsAt,
      expires_at: expiresAt,
      granted_by: user.id,
      notes: cleanNotes,
      assessment_id: assessmentId,
    })
    .select("id, package_id, type, price_paid_usd, starts_at, expires_at, granted_by, notes, assessment_id, voided_at, void_reason, created_at")
    .single();

  if (insertError || !license) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to record license" }, { status: 500 });
  }

  // 6. Audit.
  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "license.assigned",
    entityType: "license",
    entityId: license.id,
    metadata: {
      clientId: params.id,
      packageId: pkg.id,
      packageName: pkg.name,
      type: pkg.type,
      pricePaidUsd: Math.round(price * 100) / 100,
      expiresAt,
      cycleAction: plan.cycleAction,
      assessmentId,
    },
  });

  // 7. Notify the client — fire and forget.
  const { data: authUser } = await svc.auth.admin.getUserById(client.user_id);
  if (authUser?.user?.email) {
    sendPackageAssignedEmail({
      clientEmail: authUser.user.email,
      clientName: client.contact_name,
      companyName: client.company_name,
      packageName: pkg.name,
      packageType: pkg.type as LicenseType,
      expiresOn: formatLongDate(expiresAt),
      cycleOpened: plan.cycleAction === "open",
    }).catch(() => {});
  }

  // 8. Return the new row and the new entitlement.
  const entitlement = await getEntitlement(svc, params.id);
  return NextResponse.json({ license: { ...license, packageName: pkg.name }, entitlement });
}
```

- [ ] **Step 2: Write `app/api/admin/licenses/[id]/void/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";

// POST /api/admin/licenses/[id]/void { reason }
// The ledger is append-only: voiding sets voided_at / void_reason and nothing
// else. Any cycle the license opened is left as is.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { user, svc } = auth;

  const { reason } = await req.json();
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  if (!cleanReason) return NextResponse.json({ error: "reason required" }, { status: 400 });

  const { data: license } = await svc
    .from("client_licenses")
    .select("id, client_id, voided_at")
    .eq("id", params.id)
    .single();
  if (!license) return NextResponse.json({ error: "License not found" }, { status: 404 });
  if (license.voided_at) return NextResponse.json({ error: "License is already voided" }, { status: 400 });

  const voidedAt = new Date().toISOString();
  const { error } = await svc
    .from("client_licenses")
    .update({ voided_at: voidedAt, void_reason: cleanReason })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logAudit({
    actorId: user.id,
    actorRole: "admin",
    action: "license.voided",
    entityType: "license",
    entityId: params.id,
    metadata: { clientId: license.client_id, reason: cleanReason, voidedAt },
  });

  return NextResponse.json({ success: true, voidedAt });
}
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Manual check** — signed in as admin, open `http://localhost:3000/api/admin/clients/<a real client id>/licenses`. Expected: JSON with `licenses` (the grandfathered row, `packageName: "Single Assessment"`, `grantedByEmail: null`), `entitlement.status === "active"`, and `assignablePackages` where the `single` entry has `plan.allowed === false` with reason `single_requires_no_prior_license`.

- [ ] **Step 5: Commit**

```
git add "app/api/admin/clients/[id]/licenses/route.ts" "app/api/admin/licenses/[id]/void/route.ts"
git commit -m "feat(api): admin license ledger, assignment and void routes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 11: `/admin/packages` page and sidebar entry

**Files:**
- Create: `app/admin/packages/page.tsx`
- Modify: `app/admin/layout.tsx` (`ADMIN_NAV`, lines 6–12)
- Test: smoke test discovers the page automatically (Task 23 adds the assessor-denied check); manual check in Step 3.

- [ ] **Step 1: Add the nav entry** — replace lines 6–12 of `app/admin/layout.tsx` with:

```ts
const ADMIN_NAV = [
  { id: "dashboard", href: "/admin/dashboard", icon: "⊞", label: "All Clients" },
  { id: "clients", href: "/admin/clients", icon: "◈", label: "Clients" },
  { id: "reports", href: "/admin/reports", icon: "▤", label: "Analytics" },
  { id: "packages", href: "/admin/packages", icon: "▣", label: "Packages" },
  { id: "team", href: "/admin/team", icon: "◎", label: "Team" },
  { id: "profile", href: "/admin/profile", icon: "◉", label: "Profile" },
];
```

- [ ] **Step 2: Write `app/admin/packages/page.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

type PackageType = "single" | "additional" | "unlimited";

type Package = {
  id: string;
  name: string;
  type: PackageType;
  price_usd: number | string;
  duration_months: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type Draft = {
  name: string;
  priceUsd: string;
  durationMonths: string;
  description: string;
  isActive: boolean;
  sortOrder: string;
};

const TYPE_LABEL: Record<PackageType, string> = {
  single: "Single Assessment",
  additional: "Additional Assessment",
  unlimited: "Unlimited",
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, fontSize: 13,
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)",
  color: "#fff", outline: "none", boxSizing: "border-box", width: "100%",
};

const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 12px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", verticalAlign: "top" };

function toDraft(p: Package): Draft {
  return {
    name: p.name,
    priceUsd: Number(p.price_usd).toFixed(2),
    durationMonths: String(p.duration_months),
    description: p.description ?? "",
    isActive: p.is_active,
    sortOrder: String(p.sort_order),
  };
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newPkg, setNewPkg] = useState({ name: "", type: "single" as PackageType, priceUsd: "0.00", durationMonths: "3", description: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/packages");
    const data = await res.json();
    if (!res.ok) { setLoadError(data.error ?? "Could not load packages."); setLoading(false); return; }
    const list = (data.packages ?? []) as Package[];
    setPackages(list);
    setDrafts(Object.fromEntries(list.map((p) => [p.id, toDraft(p)])));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setRowMsg((m) => { const n = { ...m }; delete n[id]; return n; });
    const res = await fetch("/api/admin/packages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: d.name,
        priceUsd: Number(d.priceUsd),
        durationMonths: Number(d.durationMonths),
        description: d.description,
        isActive: d.isActive,
        sortOrder: Number(d.sortOrder),
      }),
    });
    const data = await res.json();
    setSavingId(null);
    if (!res.ok) {
      setRowMsg((m) => ({ ...m, [id]: { ok: false, text: data.error ?? "Something went wrong." } }));
    } else {
      setRowMsg((m) => ({ ...m, [id]: { ok: true, text: "Saved" } }));
      load();
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    const res = await fetch("/api/admin/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newPkg.name,
        type: newPkg.type,
        priceUsd: Number(newPkg.priceUsd),
        durationMonths: Number(newPkg.durationMonths),
        description: newPkg.description,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) { setAddError(data.error ?? "Something went wrong."); return; }
    setNewPkg({ name: "", type: "single", priceUsd: "0.00", durationMonths: "3", description: "" });
    setShowAdd(false);
    load();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Packages</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            The catalog clients see. Prices are shown to clients. At most one package of each type can be active.
          </div>
        </div>
        <button
          onClick={() => { setAddError(null); setShowAdd((v) => !v); }}
          style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", border: "none",
          }}
        >
          {showAdd ? "Cancel" : "+ Add package"}
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 16 }}>New package</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <input value={newPkg.name} onChange={(e) => setNewPkg((p) => ({ ...p, name: e.target.value }))} placeholder="Name" required style={inputStyle} />
            <select value={newPkg.type} onChange={(e) => setNewPkg((p) => ({ ...p, type: e.target.value as PackageType }))} style={{ ...inputStyle, appearance: "none" }}>
              {(Object.keys(TYPE_LABEL) as PackageType[]).map((t) => (
                <option key={t} value={t} style={{ background: "#0A1428" }}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
            <input type="number" min="0" step="0.01" value={newPkg.priceUsd} onChange={(e) => setNewPkg((p) => ({ ...p, priceUsd: e.target.value }))} placeholder="Price (USD)" style={inputStyle} />
            <input type="number" min="1" step="1" value={newPkg.durationMonths} onChange={(e) => setNewPkg((p) => ({ ...p, durationMonths: e.target.value }))} placeholder="Months" style={inputStyle} />
          </div>
          <input value={newPkg.description} onChange={(e) => setNewPkg((p) => ({ ...p, description: e.target.value }))} placeholder="Description shown to clients (optional)" style={{ ...inputStyle, marginBottom: 12 }} />
          {addError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 12 }}>{addError}</div>}
          <button type="submit" disabled={adding} style={{
            padding: "10px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: adding ? "not-allowed" : "pointer",
            background: adding ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
            color: adding ? "rgba(255,255,255,0.4)" : "#050B18", border: "none",
          }}>
            {adding ? "Creating…" : "Create package"}
          </button>
        </form>
      )}

      <div style={card}>
        {loading ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Loading packages…</div>
        ) : loadError ? (
          <div style={{ fontSize: 13, color: "#F87171" }}>{loadError}</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Type", "Name", "Price (USD)", "Months", "Description", "Active", "Order", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => {
                const d = drafts[p.id] ?? toDraft(p);
                const msg = rowMsg[p.id];
                const saving = savingId === p.id;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ ...tdStyle, fontSize: 12, color: "#00C9FF", fontWeight: 600, whiteSpace: "nowrap", paddingTop: 18 }}>
                      {TYPE_LABEL[p.type]}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 160 }}>
                      <input value={d.name} onChange={(e) => setDraft(p.id, { name: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 110 }}>
                      <input type="number" min="0" step="0.01" value={d.priceUsd} onChange={(e) => setDraft(p.id, { priceUsd: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 80 }}>
                      <input type="number" min="1" step="1" value={d.durationMonths} onChange={(e) => setDraft(p.id, { durationMonths: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, minWidth: 200 }}>
                      <input value={d.description} onChange={(e) => setDraft(p.id, { description: e.target.value })} placeholder="Shown to clients" style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, width: 60, paddingTop: 18 }}>
                      <input type="checkbox" checked={d.isActive} onChange={(e) => setDraft(p.id, { isActive: e.target.checked })} style={{ accentColor: "#4DFFA0", width: 16, height: 16 }} />
                    </td>
                    <td style={{ ...tdStyle, width: 70 }}>
                      <input type="number" step="1" value={d.sortOrder} onChange={(e) => setDraft(p.id, { sortOrder: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <button onClick={() => save(p.id)} disabled={saving} style={{
                        fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer",
                        background: saving ? "rgba(255,255,255,0.08)" : "rgba(0,201,255,0.1)",
                        color: saving ? "rgba(255,255,255,0.4)" : "#00C9FF",
                        border: "1px solid rgba(0,201,255,0.25)",
                      }}>
                        {saving ? "Saving…" : "Save"}
                      </button>
                      {msg && (
                        <div style={{ fontSize: 12, marginTop: 6, color: msg.ok ? "#4DFFA0" : "#F87171", whiteSpace: "normal", maxWidth: 220 }}>
                          {msg.text}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !loadError && packages.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            No packages yet. Add one above.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual check** — `npm run dev`, sign in as admin, open `/admin/packages`. Set a price on Single Assessment and click Save: "Saved" appears. Try Add package with type Single: the row shows `An active package of this type already exists` (409) inline.

- [ ] **Step 4: Type-check and commit**

```
npx tsc --noEmit
git add app/admin/packages/page.tsx app/admin/layout.tsx
git commit -m "feat(admin): package catalog page and nav entry" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 12: `LicensingPanel` on the admin and assessor client pages

**Files:**
- Create: `app/admin/clients/[id]/LicensingPanel.tsx`
- Modify: `app/admin/clients/[id]/page.tsx` (imports after line 20; render after line 348 `<NextStepBanner step={nextStep} />`)
- Modify: `app/assessor/clients/[id]/page.tsx` (imports after line 15; render after line 296 `<NextStepBanner step={nextStep} />`)
- Test: smoke test renders both pages (Task 24); manual check in Step 4.

- [ ] **Step 1: Write `app/admin/clients/[id]/LicensingPanel.tsx`**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type LicenseType = "single" | "additional" | "unlimited";

type LicenseItem = {
  id: string;
  packageId: string;
  packageName: string;
  type: LicenseType;
  pricePaidUsd: number;
  startsAt: string;
  expiresAt: string;
  grantedBy: string | null;
  grantedByEmail: string | null;
  notes: string | null;
  assessmentId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};

type Entitlement =
  | { status: "none"; canEdit: false; canStartCycle: false }
  | { status: "expired" | "active"; type: LicenseType; expiresAt: string; packageName: string; licenseId: string; canEdit: boolean; canStartCycle: boolean };

type AssignablePackage = {
  id: string;
  name: string;
  type: LicenseType;
  price_usd: number;
  duration_months: number;
  description: string | null;
  plan: { allowed: true; cycleAction: "open" | "reuse" | "none" } | { allowed: false; reason: string };
};

type PanelData = { licenses: LicenseItem[]; entitlement: Entitlement; assignablePackages: AssignablePackage[] };

const TYPE_LABEL: Record<LicenseType, string> = { single: "Single", additional: "Additional", unlimited: "Unlimited" };

const CYCLE_TEXT: Record<"open" | "reuse" | "none", string> = {
  open: "This opens a new assessment cycle. The client's previous answers carry forward.",
  reuse: "This continues the client's current, unfinished assessment cycle.",
  none: "No assessment cycle is opened now. The client's first cycle starts on their next visit.",
};

const REASON_TEXT: Record<string, string> = {
  single_requires_no_prior_license: "Single Assessment can only be assigned to a client with no prior license.",
  additional_requires_prior_license: "Additional Assessment requires a prior license.",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#0F172A", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16, padding: 32, width: 460, maxWidth: "90vw",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
  padding: "10px 14px", fontSize: 14, color: "#E2E8F0", outline: "none", boxSizing: "border-box",
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600,
  color: "rgba(255,255,255,0.5)", cursor: "pointer",
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "rgba(0,201,255,0.3)" : "#00C9FF", border: "none",
  borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
  color: "#0F172A", cursor: disabled ? "not-allowed" : "pointer",
});
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14, padding: 24, marginBottom: 24,
};
const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", fontSize: 12, color: "rgba(255,255,255,0.6)", verticalAlign: "top" };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function LicensingPanel({ clientId, readOnly = false }: { clientId: string; readOnly?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<PanelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [packageId, setPackageId] = useState("");
  const [price, setPrice] = useState("0.00");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Void modal
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${clientId}/licenses`);
    const body = await res.json();
    if (!res.ok) { setLoadError(body.error ?? "Could not load licenses."); return; }
    setLoadError(null);
    setData(body);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const allowedPackages = (data?.assignablePackages ?? []).filter((p) => p.plan.allowed);
  const blockedPackages = (data?.assignablePackages ?? []).filter((p) => !p.plan.allowed);
  const selected = allowedPackages.find((p) => p.id === packageId) ?? null;

  function openAssign() {
    const first = allowedPackages[0] ?? null;
    setPackageId(first?.id ?? "");
    setPrice(first ? first.price_usd.toFixed(2) : "0.00");
    setNotes("");
    setConfirming(false);
    setAssignError(null);
    setAssignOpen(true);
  }

  function choosePackage(id: string) {
    setPackageId(id);
    const p = allowedPackages.find((x) => x.id === id);
    if (p) setPrice(p.price_usd.toFixed(2));
  }

  async function submitAssign() {
    if (!selected) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/licenses`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: selected.id, pricePaidUsd: Number(price), notes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAssignError(REASON_TEXT[body.error] ?? body.error ?? "Something went wrong.");
        setConfirming(false);
      } else {
        setAssignOpen(false);
        await load();
        router.refresh();
      }
    } catch { setAssignError("Network error. Please try again."); }
    finally { setAssignLoading(false); }
  }

  function openVoid(id: string) {
    setVoidId(id);
    setVoidReason("");
    setVoidError(null);
  }

  async function submitVoid() {
    if (!voidId) return;
    if (!voidReason.trim()) { setVoidError("Enter a reason."); return; }
    setVoidLoading(true);
    setVoidError(null);
    try {
      const res = await fetch(`/api/admin/licenses/${voidId}/void`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason }),
      });
      const body = await res.json();
      if (!res.ok) { setVoidError(body.error ?? "Something went wrong."); }
      else { setVoidId(null); await load(); router.refresh(); }
    } catch { setVoidError("Network error. Please try again."); }
    finally { setVoidLoading(false); }
  }

  const entitlement = data?.entitlement ?? null;
  const badge = !entitlement
    ? { text: "Loading…", color: "rgba(255,255,255,0.35)" }
    : entitlement.status === "active"
      ? { text: `Active until ${fmt(entitlement.expiresAt)}`, color: "#4DFFA0" }
      : entitlement.status === "expired"
        ? { text: `Expired on ${fmt(entitlement.expiresAt)}`, color: "#F87171" }
        : { text: "No license", color: "#8892A0" };

  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Licensing</div>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 20,
          color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}33`,
        }}>
          {badge.text}
        </span>
        {entitlement && entitlement.status !== "none" && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {entitlement.packageName} · {TYPE_LABEL[entitlement.type]}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {!readOnly && data && (
          <button onClick={openAssign} style={{
            padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: "rgba(0,201,255,0.1)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
          }}>
            Assign package
          </button>
        )}
      </div>

      {loadError && <div style={{ fontSize: 13, color: "#F87171" }}>{loadError}</div>}

      {data && data.licenses.length === 0 && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No purchases recorded.</div>
      )}

      {data && data.licenses.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Date", "Package", "Type", "Price", "Expires", "Notes", "Granted by", "Voided", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.licenses.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: l.voidedAt ? 0.55 : 1 }}>
                <td style={{ ...tdStyle, color: "#E2E8F0", whiteSpace: "nowrap" }}>{fmt(l.startsAt)}</td>
                <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{l.packageName}</td>
                <td style={tdStyle}>{TYPE_LABEL[l.type]}</td>
                <td style={tdStyle}>{money(l.pricePaidUsd)}</td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmt(l.expiresAt)}</td>
                <td style={tdStyle}>{l.notes ?? "—"}</td>
                <td style={tdStyle}>{l.grantedByEmail || (l.grantedBy ? "Admin" : "System")}</td>
                <td style={tdStyle}>
                  {l.voidedAt ? (
                    <span style={{ color: "#F87171" }}>{fmt(l.voidedAt)}{l.voidReason ? ` — ${l.voidReason}` : ""}</span>
                  ) : "—"}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {!readOnly && !l.voidedAt && (
                    <button onClick={() => openVoid(l.id)} style={{
                      fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(248,113,113,0.1)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)",
                    }}>
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Assign modal */}
      {assignOpen && (
        <div style={overlayStyle} onClick={() => setAssignOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
              {confirming ? "Confirm assignment" : "Assign package"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Records an offline purchase. The license starts today and activates immediately.
            </div>

            {!confirming ? (
              <>
                {allowedPackages.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#FFB347", marginBottom: 16 }}>
                    No package can be assigned right now.
                    {blockedPackages.map((p) => (
                      <div key={p.id} style={{ color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
                        {p.name}: {!p.plan.allowed ? (REASON_TEXT[p.plan.reason] ?? p.plan.reason) : ""}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Package</label>
                      <select value={packageId} onChange={(e) => choosePackage(e.target.value)} style={{ ...inputStyle, appearance: "none" }}>
                        {allowedPackages.map((p) => (
                          <option key={p.id} value={p.id} style={{ background: "#0A1428" }}>
                            {p.name} — {money(p.price_usd)} · {p.duration_months} months
                          </option>
                        ))}
                      </select>
                      {selected?.description && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>{selected.description}</div>
                      )}
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>Price paid (USD)</label>
                      <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={labelStyle}>Notes (invoice or PO number)</label>
                      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="INV-1042" style={inputStyle} />
                    </div>
                  </>
                )}
                {assignError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{assignError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setAssignOpen(false)} style={cancelBtn}>Cancel</button>
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!selected || !Number.isFinite(Number(price)) || Number(price) < 0}
                    style={primaryBtn(!selected || !Number.isFinite(Number(price)) || Number(price) < 0)}
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : selected && (
              <>
                <div style={{ fontSize: 14, color: "#E2E8F0", lineHeight: 1.7, marginBottom: 12 }}>
                  Assign <strong style={{ color: "#fff" }}>{selected.name}</strong> for <strong style={{ color: "#fff" }}>{money(Number(price))}</strong>,
                  valid for {selected.duration_months} months from today.
                  {notes.trim() ? <> Notes: <em>{notes.trim()}</em>.</> : null}
                </div>
                <div style={{
                  fontSize: 13, color: "#00C9FF", background: "rgba(0,201,255,0.06)",
                  border: "1px solid rgba(0,201,255,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 20,
                }}>
                  {selected.plan.allowed ? CYCLE_TEXT[selected.plan.cycleAction] : ""}
                </div>
                {assignError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{assignError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setConfirming(false)} style={cancelBtn}>Back</button>
                  <button type="button" onClick={submitAssign} disabled={assignLoading} style={primaryBtn(assignLoading)}>
                    {assignLoading ? "Assigning…" : "Confirm assignment"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Void modal */}
      {voidId && (
        <div style={overlayStyle} onClick={() => setVoidId(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F87171", marginBottom: 8 }}>Void license</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 16 }}>
              A voided license no longer counts toward the client's entitlement. The purchase stays in the history with your reason.
              Any assessment cycle it opened is left as is.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Reason</label>
              <textarea
                value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3}
                placeholder="Entered in error / refunded / duplicate purchase"
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
            {voidError && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{voidError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setVoidId(null)} style={cancelBtn}>Cancel</button>
              <button onClick={submitVoid} disabled={voidLoading} style={{
                background: "#F87171", border: "none", borderRadius: 8,
                padding: "8px 20px", fontSize: 13, fontWeight: 700, color: "#fff",
                cursor: voidLoading ? "not-allowed" : "pointer", opacity: voidLoading ? 0.6 : 1,
              }}>
                {voidLoading ? "Voiding…" : "Void license"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render it on the admin client page** — in `app/admin/clients/[id]/page.tsx` add after line 20 (`import AssignAssessorSelect from "./AssignAssessorSelect";`):

```ts
import LicensingPanel from "./LicensingPanel";
```

and replace lines 347–348:

```tsx
      {/* What to do next */}
      <NextStepBanner step={nextStep} />
```

with:

```tsx
      {/* What to do next */}
      <NextStepBanner step={nextStep} />

      {/* Licensing — entitlement, purchase history, assign and void */}
      <LicensingPanel clientId={params.id} />
```

- [ ] **Step 3: Render it read-only on the assessor client page** — in `app/assessor/clients/[id]/page.tsx` add after line 15 (`import IntakeQuestionsPanel from "@/app/admin/clients/[id]/IntakeQuestionsPanel";`):

```ts
import LicensingPanel from "@/app/admin/clients/[id]/LicensingPanel";
```

and replace lines 295–296:

```tsx
      {/* What to do next */}
      <NextStepBanner step={nextStep} />
```

with:

```tsx
      {/* What to do next */}
      <NextStepBanner step={nextStep} />

      {/* Licensing — read-only mirror of the admin panel */}
      <LicensingPanel clientId={params.id} readOnly />
```

- [ ] **Step 4: Manual check** — as admin, open a grandfathered client: badge reads `Active until <date>`, the history shows the grandfathered row with notes `Grandfathered at licensing launch`, Assign package offers Unlimited (and Additional) but not Single. Void the grandfathered row with a reason: badge becomes `No license` and Single becomes assignable. Assign Single: badge returns to Active and the confirm text stated the cycle action. As assessor, open the same client under `/assessor/clients/<id>`: panel present, no Assign button, no Void buttons.

- [ ] **Step 5: Type-check and commit**

```
npx tsc --noEmit
git add "app/admin/clients/[id]/LicensingPanel.tsx" "app/admin/clients/[id]/page.tsx" "app/assessor/clients/[id]/page.tsx"
git commit -m "feat(admin): LicensingPanel with assign and void on admin and assessor client pages" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 13: License column on the client lists

**Files:**
- Modify: `app/admin/clients/page.tsx` (lines 1–2 imports; 7–10 query; 28 headers; 44–49 cell)
- Modify: `app/admin/dashboard/page.tsx` (lines 1–2 imports; 18–21 query; 79 headers; 109–118 cell)
- Test: smoke test renders both pages (Task 24).

- [ ] **Step 1: `app/admin/clients/page.tsx`** — replace lines 1–2 with:

```ts
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { computeEntitlement, entitlementSummary, toLicenseRows } from "@/lib/licensing";
```

Replace lines 7–10 with:

```ts
  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, phone, cmmc_target_level, engagement_stage, created_at, client_licenses(id, type, starts_at, expires_at, voided_at, packages(name))")
    .order("created_at", { ascending: false });

  const now = new Date();
```

Replace the header array on line 28 with:

```ts
              {["Company", "Contact", "Phone", "CMMC Level", "Stage", "License", "Action"].map((h) => (
```

Replace lines 44–49 (the Stage `<td>` block, from `<td style={{ padding: "12px 8px" }}>` through its closing `</td>`) with:

```tsx
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}18`, color, fontWeight: 600, textTransform: "capitalize" }}>
                      {c.engagement_stage}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {(() => {
                      const lic = entitlementSummary(computeEntitlement(
                        toLicenseRows(((c as { client_licenses?: unknown }).client_licenses ?? []) as Parameters<typeof toLicenseRows>[0]),
                        null,
                        now,
                      ));
                      return <span style={{ fontSize: 12, fontWeight: 600, color: lic.color }}>{lic.label}</span>;
                    })()}
                  </td>
```

- [ ] **Step 2: `app/admin/dashboard/page.tsx`** — replace lines 1–2 with:

```ts
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { computeEntitlement, entitlementSummary, toLicenseRows } from "@/lib/licensing";
```

Replace lines 18–21 with:

```ts
  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level, engagement_stage, engagement_type, assessments(id, status, started_at), client_licenses(id, type, starts_at, expires_at, voided_at, packages(name))")
    .order("created_at", { ascending: false });

  const now = new Date();
```

Replace the header array on line 79 with:

```ts
              {["Company", "Contact", "CMMC Level", "Package", "Stage", "Assessment", "License", "Action"].map((h) => (
```

Replace lines 109–117 (the Assessment `<td>` block, from `<td style={{ padding: "12px 8px" }}>` containing `statusCfg` through its closing `</td>`) with:

```tsx
                  <td style={{ padding: "12px 8px" }}>
                    {statusCfg ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: statusCfg.color }}>
                        {statusCfg.label}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Not started</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {(() => {
                      const lic = entitlementSummary(computeEntitlement(
                        toLicenseRows(((c as { client_licenses?: unknown }).client_licenses ?? []) as Parameters<typeof toLicenseRows>[0]),
                        null,
                        now,
                      ));
                      return <span style={{ fontSize: 12, fontWeight: 600, color: lic.color }}>{lic.label}</span>;
                    })()}
                  </td>
```

- [ ] **Step 3: Manual check** — `/admin/clients` and `/admin/dashboard` show a License column reading `Active, <Mon D, YYYY>` for grandfathered clients and `None` for clients with no assessment.

- [ ] **Step 4: Type-check and commit**

```
npx tsc --noEmit
git add app/admin/clients/page.tsx app/admin/dashboard/page.tsx
git commit -m "feat(admin): License column on client lists" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Chunk 4 — Portal (after chunk 1; parallel with 3, 5; Task 14 after Task 7)

## Task 14: `POST /api/assessment/start-cycle` with route tests

**Files:**
- Create: `app/api/assessment/start-cycle/route.ts`
- Modify: `tests/license-gates.test.ts` (append one import and one `describe`; requires Task 7 to have landed)
- Test: `tests/license-gates.test.ts`

- [ ] **Step 1: Append the failing tests** — in `tests/license-gates.test.ts` add after the line `import { POST as saveScoping } from "@/app/api/scoping/route";`:

```ts
import { POST as startCycle } from "@/app/api/assessment/start-cycle/route";
```

and append at the end of the file:

```ts

describe("POST /api/assessment/start-cycle", () => {
  const request = () => new NextRequest("http://localhost/api/assessment/start-cycle", { method: "POST" });

  it("allows the owning client with an active Unlimited license and a finalized cycle", async () => {
    seed({ license: "active", licenseType: "unlimited", assessmentStatus: "finalized" });
    tables().assessment_responses.push({ id: "r1", assessment_id: ASSESSMENT_ID, control_id: "3.1.1", response: "yes", notes: null, no_artifacts: false, no_policy_document: false, no_implementation_artifact: false });
    signIn(OWNER);
    const res = await startCycle(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.assessmentId).toBe("string");
    const created = tables().assessments.find((a) => a.id === body.assessmentId);
    expect(created?.previous_assessment_id).toBe(ASSESSMENT_ID);
    expect(created?.status).toBe("in_progress");
    expect(tables().assessment_responses.filter((r) => r.assessment_id === body.assessmentId)).toHaveLength(1);
  });

  it("returns 403 license_inactive for the owning client with an expired license", async () => {
    seed({ license: "expired", licenseType: "unlimited", assessmentStatus: "finalized" });
    signIn(OWNER);
    const res = await startCycle(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "license_inactive" });
    expect(tables().assessments).toHaveLength(1);
  });

  it("returns 403 Forbidden for a client user with no client record", async () => {
    seed({ license: "active", licenseType: "unlimited", assessmentStatus: "finalized" });
    tables().clients = tables().clients.filter((c) => c.id !== OTHER_CLIENT_ID);
    signIn(OTHER);
    const res = await startCycle(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("returns 403 Forbidden for an admin (client-only route)", async () => {
    seed({ license: "active", licenseType: "unlimited", assessmentStatus: "finalized" });
    signIn(ADMIN);
    const res = await startCycle(request());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

```
npx vitest run tests/license-gates.test.ts
```

Expected: `Error: Failed to resolve import "@/app/api/assessment/start-cycle/route"` (the whole file fails to load; 0 passed).

- [ ] **Step 3: Write `app/api/assessment/start-cycle/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { getEntitlement } from "@/lib/licensing";
import { startReassessmentCycle } from "@/lib/reassessment";

// POST /api/assessment/start-cycle
// A client with an active Unlimited license starts their own next cycle once
// the current one is finalized. Previous answers carry forward. Single and
// Additional clients cannot start cycles; the admin's assignment opens them.
export async function POST(_req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceSupabaseClient();

  const { data: client } = await svc
    .from("clients")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entitlement = await getEntitlement(svc, client.id);
  if (entitlement.status !== "active") return NextResponse.json({ error: "license_inactive" }, { status: 403 });
  if (entitlement.type !== "unlimited") return NextResponse.json({ error: "unlimited_required" }, { status: 403 });

  const { data: latest } = await svc
    .from("assessments")
    .select("id, status")
    .eq("client_id", client.id)
    .not("status", "eq", "archived")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();
  if (!latest || latest.status !== "finalized") {
    return NextResponse.json({ error: "The current assessment cycle is not finalized" }, { status: 400 });
  }

  const result = await startReassessmentCycle({
    svc,
    clientId: client.id,
    previousAssessmentId: latest.id,
    actorUserId: user.id,
    actorRole: "client",
    notifyClient: false,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ assessmentId: result.assessmentId });
}
```

- [ ] **Step 4: Run the tests and see them pass**

```
npx vitest run tests/license-gates.test.ts
```

Expected: `✓ tests/license-gates.test.ts (20 tests)`, `Tests  20 passed (20)`.

- [ ] **Step 5: Commit**

```
git add app/api/assessment/start-cycle/route.ts tests/license-gates.test.ts
git commit -m "feat(api): clients on Unlimited start their next cycle via POST /api/assessment/start-cycle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 15: `POST /api/licenses/request`

**Files:**
- Create: `app/api/licenses/request/route.ts`
- Test: none automated (sends e-mail); manual check via the portal modal in Task 17.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendPackageRequestEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// POST /api/licenses/request { packageId, message? }
// Open to clients in any entitlement state. Emails the admin; nothing is
// written to the ledger — the admin records the purchase after payment.
export async function POST(req: NextRequest) {
  const authSupabase = createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { packageId, message } = await req.json();
  if (!packageId) return NextResponse.json({ error: "packageId required" }, { status: 400 });

  const svc = createServiceSupabaseClient();

  const { data: client } = await svc
    .from("clients")
    .select("id, company_name, contact_name")
    .eq("user_id", user.id)
    .single();
  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: pkg } = await svc
    .from("packages")
    .select("id, name, price_usd, is_active")
    .eq("id", packageId)
    .single();
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  if (!pkg.is_active) return NextResponse.json({ error: "Package is not active" }, { status: 400 });

  const text = typeof message === "string" ? message.trim().slice(0, 2000) : "";

  // Notify the admin — fire and forget
  sendPackageRequestEmail({
    companyName: client.company_name,
    contactName: client.contact_name,
    clientId: client.id,
    packageName: pkg.name,
    priceUsd: Number(pkg.price_usd),
    message: text || null,
  }).catch(() => {});

  logAudit({
    actorId: user.id,
    actorRole: "client",
    action: "license.requested",
    entityType: "client",
    entityId: client.id,
    metadata: { packageId: pkg.id, packageName: pkg.name, message: text || null },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Type-check and commit**

```
npx tsc --noEmit
git add app/api/licenses/request/route.ts
git commit -m "feat(api): clients request a package (emails admin, audited)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 16: Shared portal components — `LicenseBanner`, `RequestPackageButton`, `StartCycleButton`

**Files:**
- Create: `components/LicenseBanner.tsx`
- Create: `components/RequestPackageButton.tsx`
- Create: `components/StartCycleButton.tsx`
- Test: rendered by Tasks 17–19; `npx tsc --noEmit` must pass.

- [ ] **Step 1: Write `components/LicenseBanner.tsx`** (also exports the portal-side entitlement type and the `license_inactive` helpers every portal page uses)

```tsx
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
```

- [ ] **Step 2: Write `components/RequestPackageButton.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

type PackageOption = {
  id: string;
  name: string;
  type: string;
  price_usd: number | string;
  duration_months: number;
  description: string | null;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#0F172A", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16, padding: 32, width: 460, maxWidth: "90vw",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "rgba(255,255,255,0.5)", display: "block",
  marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px",
};
const inputStyle: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
  padding: "10px 14px", fontSize: 14, color: "#E2E8F0", outline: "none", boxSizing: "border-box",
};
const cancelBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600,
  color: "rgba(255,255,255,0.5)", cursor: "pointer",
};

export default function RequestPackageButton() {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [packageId, setPackageId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active packages are readable by any signed-in user through RLS.
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase
      .from("packages")
      .select("id, name, type, price_usd, duration_months, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const list = (data ?? []) as PackageOption[];
        setPackages(list);
        setPackageId((current) => current || (list[0]?.id ?? ""));
      });
  }, [open]);

  const selected = packages.find((p) => p.id === packageId) ?? null;

  function openModal() {
    setSent(false);
    setError(null);
    setMessage("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!packageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/licenses/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, message }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setSent(true);
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <>
      <button onClick={openModal} style={{
        padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
        background: "rgba(0,201,255,0.1)", border: "1px solid rgba(0,201,255,0.35)", color: "#00C9FF",
        whiteSpace: "nowrap",
      }}>
        Request package
      </button>

      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Request a package</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>
              Galaxy will contact you to arrange payment. Your license activates once the purchase is recorded.
            </div>
            {sent ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#4DFFA0", marginBottom: 24 }}>Your request was sent to Galaxy.</div>
                <button onClick={() => setOpen(false)} style={cancelBtn}>Close</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Package</label>
                  <select value={packageId} onChange={(e) => setPackageId(e.target.value)} required style={{ ...inputStyle, appearance: "none" }}>
                    {packages.length === 0 && <option value="" style={{ background: "#0A1428" }}>Loading…</option>}
                    {packages.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "#0A1428" }}>
                        {p.name} — ${Number(p.price_usd).toFixed(2)} · {p.duration_months} months
                      </option>
                    ))}
                  </select>
                  {selected?.description && (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6, lineHeight: 1.5 }}>{selected.description}</div>
                  )}
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Message (optional)</label>
                  <textarea
                    value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                    placeholder="Anything Galaxy should know — PO number, timing, questions."
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                {error && <div style={{ fontSize: 13, color: "#F87171", marginBottom: 16 }}>{error}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setOpen(false)} style={cancelBtn}>Cancel</button>
                  <button type="submit" disabled={loading || !packageId} style={{
                    background: loading || !packageId ? "rgba(0,201,255,0.3)" : "#00C9FF", border: "none",
                    borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 700,
                    color: "#0F172A", cursor: loading || !packageId ? "not-allowed" : "pointer",
                  }}>
                    {loading ? "Sending…" : "Send request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write `components/StartCycleButton.tsx`**

```tsx
"use client";

import { useState } from "react";

export default function StartCycleButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assessment/start-cycle", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error === "license_inactive" ? "Your license is not active."
            : data.error === "unlimited_required" ? "Only the Unlimited package lets you start a new cycle."
            : data.error ?? "Could not start a new assessment."
        );
        setLoading(false);
        return;
      }
      window.location.href = "/portal/assessment";
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button onClick={start} disabled={loading} style={{
        padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        background: loading ? "rgba(0,201,255,0.3)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
        color: loading ? "rgba(255,255,255,0.5)" : "#050B18", border: "none", whiteSpace: "nowrap",
      }}>
        {loading ? "Starting…" : "Start new assessment →"}
      </button>
      {error && <span style={{ fontSize: 12, color: "#F87171" }}>{error}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Type-check and commit**

```
npx tsc --noEmit
git add components/LicenseBanner.tsx components/RequestPackageButton.tsx components/StartCycleButton.tsx
git commit -m "feat(portal): LicenseBanner, RequestPackageButton and StartCycleButton components" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 17: Portal dashboard — License card and Start new assessment card

**Files:**
- Modify: `app/portal/dashboard/page.tsx` (imports lines 1–5; after the client lookup at line 96; render between the header `</div>` at line 197 and `{/* No assessment yet */}` at line 199)
- Test: smoke test renders `/portal/dashboard` with and without a client record (Task 24); manual check in Step 3.

- [ ] **Step 1: Replace lines 1–5 (imports) with:**

```ts
import { createServerSupabaseClient, createServiceSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getControlsForLevel } from "@/lib/controls";
import { getEntitlement, formatLongDate, type Entitlement } from "@/lib/licensing";
import Link from "next/link";
import InfoRequestCard from "./InfoRequestCard";
import RequestPackageButton from "@/components/RequestPackageButton";
import StartCycleButton from "@/components/StartCycleButton";
```

- [ ] **Step 2: Insert after line 96 (the `.single();` that ends the `clients` lookup):**

```ts

  // Entitlement is derived from the ledger. No client record → no license.
  const entitlement: Entitlement = client
    ? await getEntitlement(createServiceSupabaseClient(), client.id)
    : { status: "none", canEdit: false, canStartCycle: false };

  const licenseLine = entitlement.status === "active"
    ? entitlement.type === "unlimited"
      ? `Your ${entitlement.packageName} package lets you run assessments as often as you like until ${formatLongDate(entitlement.expiresAt)}.`
      : `Your ${entitlement.packageName} package lets you submit one assessment by ${formatLongDate(entitlement.expiresAt)}.`
    : entitlement.status === "expired"
      ? `Your license expired on ${formatLongDate(entitlement.expiresAt)}.`
      : "You do not have an active license.";
  const licenseColor = entitlement.status === "active" ? "#4DFFA0" : entitlement.status === "expired" ? "#F87171" : "#8892A0";
  const licenseStatusLabel = entitlement.status === "active" ? "Active" : entitlement.status === "expired" ? "Expired" : "No license";
```

- [ ] **Step 3: Insert between the header block's closing `</div>` (line 197) and `{/* No assessment yet */}` (line 199):**

```tsx

      {/* License */}
      <div style={{ ...card, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>License</div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              color: licenseColor, background: `${licenseColor}18`, border: `1px solid ${licenseColor}33`,
            }}>
              {licenseStatusLabel}
            </span>
          </div>
          {entitlement.status !== "none" && (
            <div style={{ fontSize: 13, color: "#E2E8F0", marginBottom: 4 }}>
              {entitlement.packageName} · {entitlement.status === "active" ? "expires" : "expired"} {formatLongDate(entitlement.expiresAt)}
            </div>
          )}
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{licenseLine}</div>
        </div>
        <RequestPackageButton />
      </div>

      {/* Unlimited: start the next cycle once the current one is finalized */}
      {entitlement.canStartCycle && (
        <div style={{ ...card, marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Start new assessment</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              Your previous answers carry forward. You only need to update the controls that changed since your last assessment.
            </div>
          </div>
          <StartCycleButton />
        </div>
      )}
```

- [ ] **Step 4: Manual check** — as a grandfathered client: License card shows `Active`, `Single Assessment · expires <date>`, and the single-assessment line; Request package opens the modal, lists the three packages with prices, and confirms "Your request was sent to Galaxy." (admin inbox gets `[Galaxy] <Company> — Package Request: …` when `RESEND_API_KEY` and `ADMIN_NOTIFY_EMAIL` are set). As a client whose admin assigned Unlimited and whose cycle is finalized: the Start new assessment card appears and the button lands on `/portal/assessment` with the previous answers pre-filled.

- [ ] **Step 5: Type-check and commit**

```
npx tsc --noEmit
git add app/portal/dashboard/page.tsx
git commit -m "feat(portal): License card and Start new assessment card on the dashboard" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 18: Portal assessment page — banner, disabled controls, previous-cycle reference, finalized copy

**Files:**
- Modify: `app/portal/assessment/page.tsx` (edits E1–E11 below, each anchored on exact current text)
- Test: smoke test renders `/portal/assessment` (Task 24); manual check in Step 12.

- [ ] **E1 — imports.** After line 6 (`import type { ResponseMap } from "@/lib/scoring";`) add:

```ts
import LicenseBanner, { NO_LICENSE, isLicenseInactiveResponse, markInactive, type PortalEntitlement } from "@/components/LicenseBanner";
import StartCycleButton from "@/components/StartCycleButton";

const RESPONSE_LABEL: Record<string, string> = { yes: "Yes", partial: "Partial", no: "No", na: "N/A" };
```

- [ ] **E2 — state.** After line 37 (`const [submitError, setSubmitError] = useState<string | null>(null);`) add:

```ts
  const [entitlement, setEntitlement] = useState<PortalEntitlement>(NO_LICENSE);
  const [previousResponses, setPreviousResponses] = useState<Record<string, string>>({});
```

- [ ] **E3 — load entitlement and previous answers.** After line 79 (`setNoImplementationArtifact(noImplMap);`) add:

```ts
      setEntitlement(data.entitlement ?? NO_LICENSE);
      const prevMap: Record<string, string> = {};
      for (const r of data.previousResponses ?? []) prevMap[r.control_id] = r.response;
      setPreviousResponses(prevMap);
```

- [ ] **E4 — saveResponse handles `license_inactive`.** Replace the whole `saveResponse` callback (lines 99–121) with:

```ts
  const saveResponse = useCallback(async (
    controlId: string,
    response: Response,
    note: string,
    noPolicy: boolean,
    noImpl: boolean,
  ) => {
    if (!assessmentId || !entitlement.canEdit) return;
    setSaving(true);
    const res = await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assessmentId,
        controlId,
        response,
        notes: note,
        no_policy_document: noPolicy,
        no_implementation_artifact: noImpl,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
    }
    setSaving(false);
  }, [assessmentId, entitlement.canEdit]);
```

- [ ] **E5 — derived flag.** After line 139 (`const evidenceSatisfied = needsEvidence ? (policySatisfied && implementationSatisfied) : true;`) add:

```ts
  const licenseBlocked = !entitlement.canEdit;
  const previousAnswer = previousResponses[control?.id ?? ""];
```

- [ ] **E6 — guard the handlers.** Change the first line of `handleResponse` (line 141) from `function handleResponse(val: Response) {` to:

```ts
  function handleResponse(val: Response) {
    if (licenseBlocked) return;
```

Change the first line of `handleNoPolicyToggle` (line 162) to:

```ts
  function handleNoPolicyToggle(checked: boolean) {
    if (licenseBlocked) return;
```

Change the first line of `handleNoImplementationToggle` (line 171) to:

```ts
  function handleNoImplementationToggle(checked: boolean) {
    if (licenseBlocked) return;
```

- [ ] **E7 — upload and delete.** Replace `handleUpload` (lines 198–231) with:

```ts
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, artifactType: "policy" | "implementation") {
    const file = e.target.files?.[0];
    if (!file || !assessmentId || !control || licenseBlocked) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append("assessmentId", assessmentId);
    form.append("controlId", control.id);
    form.append("artifactType", artifactType);
    form.append("file", file);
    const res = await fetch("/api/artifacts", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      setArtifacts((prev) => ({
        ...prev,
        [control.id]: [...(prev[control.id] ?? []), data.artifact],
      }));
      setArtifactError(false);
      // Clear the "not available" flag for the type they just uploaded
      if (artifactType === "policy" && (noPolicyDocument[control.id] ?? false)) {
        setNoPolicyDocument((n) => ({ ...n, [control.id]: false }));
        const noImpl = noImplementationArtifact[control.id] ?? false;
        if (currentResponse) saveResponse(control.id, currentResponse, currentNote, false, noImpl);
      } else if (artifactType === "implementation" && (noImplementationArtifact[control.id] ?? false)) {
        setNoImplementationArtifact((n) => ({ ...n, [control.id]: false }));
        const noPolicy = noPolicyDocument[control.id] ?? false;
        if (currentResponse) saveResponse(control.id, currentResponse, currentNote, noPolicy, false);
      }
    } else if (isLicenseInactiveResponse(res, data)) {
      setEntitlement(markInactive);
    } else {
      setUploadError(data.error ?? "Upload failed");
    }
    setUploading(false);
    e.target.value = "";
  }

  async function handleDelete(artifactId: string, controlId: string) {
    if (licenseBlocked) return;
    const res = await fetch(`/api/artifacts?artifactId=${artifactId}`, { method: "DELETE" });
    if (res.ok) {
      setArtifacts((prev) => ({
        ...prev,
        [controlId]: (prev[controlId] ?? []).filter((a) => a.id !== artifactId),
      }));
    } else {
      const data = await res.json().catch(() => null);
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
    }
  }
```

and delete the original `handleDelete` (lines 233–241) so it is not defined twice.

- [ ] **E8 — submit.** Replace `handleSubmit` (lines 253–277) with:

```ts
  async function handleSubmit() {
    if (needsEvidence && !evidenceSatisfied) {
      setArtifactError(true);
      return;
    }
    if (!assessmentId || licenseBlocked) return;
    setSaving(true);
    setSubmitError(null);
    const res = await fetch("/api/assessment/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      if (isLicenseInactiveResponse(res, data)) {
        setEntitlement(markInactive);
      } else if (data.missingArtifacts) {
        setSubmitError(`Evidence required for ${data.missingArtifacts.length} control(s): ${data.missingArtifacts.slice(0, 5).join(", ")}${data.missingArtifacts.length > 5 ? "…" : ""}. Please go back and provide both a policy document and implementation evidence for each, or mark each type as unavailable.`);
      } else {
        setSubmitError(data.error ?? "Submission failed");
      }
      return;
    }
    window.location.href = "/portal/dashboard";
  }
```

- [ ] **E9 — finalized-state copy.** Replace lines 328–332:

```tsx
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 420 }}>
          {assessmentStatus === "finalized"
            ? "Your assessment is finalized and no longer editable. When it's time to reassess your environment, Galaxy Consulting will start a new cycle for you — your previous answers will carry forward automatically."
            : "Your assessment has been submitted and is no longer editable. Return to your dashboard to check the status."}
        </div>
```

with:

```tsx
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 420 }}>
          {assessmentStatus === "finalized"
            ? entitlement.canStartCycle
              ? "Your assessment is finalized. Your Unlimited package lets you start the next assessment cycle yourself — your previous answers carry forward, so you only update the controls that changed."
              : "Your assessment is finalized and no longer editable. When it's time to reassess your environment, Galaxy Consulting will start a new cycle for you — your previous answers will carry forward automatically."
            : "Your assessment has been submitted and is no longer editable. Return to your dashboard to check the status."}
        </div>
        {assessmentStatus === "finalized" && entitlement.canStartCycle && <StartCycleButton />}
```

- [ ] **E10 — EvidencePanel respects the block.** Inside `EvidencePanel`, change the delete button (lines 424–432) to:

```tsx
                <button
                  onClick={() => handleDelete(artifact.id, control.id)}
                  disabled={licenseBlocked}
                  style={{
                    background: "none", border: "none", color: licenseBlocked ? "rgba(255,255,255,0.15)" : "rgba(248,113,113,0.6)",
                    cursor: licenseBlocked ? "not-allowed" : "pointer", fontSize: 18, padding: "0 4px", flexShrink: 0,
                  }}
                >
                  ×
                </button>
```

change the upload `<label ...>` block (lines 447–462) to:

```tsx
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            border: "1px dashed rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.03)",
            color: uploading || licenseBlocked ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.6)",
            cursor: uploading || licenseBlocked ? "not-allowed" : "pointer", marginBottom: 4,
          }}>
            <span>{uploading ? "Uploading..." : `+ ${uploadLabel}`}</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt"
              onChange={(e) => handleUpload(e, type)}
              disabled={uploading || licenseBlocked}
              style={{ display: "none" }}
            />
          </label>
```

and change the not-available checkbox `<input type="checkbox" ...>` (lines 477–482) to:

```tsx
              <input
                type="checkbox"
                checked={noFlag}
                onChange={(e) => onToggle(e.target.checked)}
                disabled={licenseBlocked}
                style={{ marginTop: 2, accentColor: "#F87171", width: 14, height: 14, flexShrink: 0 }}
              />
```

- [ ] **E11 — main render.** Replace the opening of the return (lines 498–500):

```tsx
  return (
    <div>
      {/* Remediation required banner */}
```

with:

```tsx
  return (
    <div>
      {/* License inactive banner */}
      {entitlement.status !== "active" && <LicenseBanner status={entitlement.status} />}

      {/* Remediation required banner */}
```

Replace the control description block (lines 580–582):

```tsx
        <div style={{ fontSize: 16, color: "#fff", lineHeight: 1.6, marginBottom: 28, fontWeight: 500 }}>
          {control.description}
        </div>
```

with:

```tsx
        <div style={{ fontSize: 16, color: "#fff", lineHeight: 1.6, marginBottom: previousAnswer ? 8 : 28, fontWeight: 500 }}>
          {control.description}
        </div>
        {previousAnswer && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>
            Last cycle: <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>{RESPONSE_LABEL[previousAnswer] ?? previousAnswer}</span>
          </div>
        )}
```

Replace the response `<button ...>` (lines 596–604):

```tsx
              <button key={opt.val} onClick={() => handleResponse(opt.val)} style={{
                flex: 1, padding: "10px 6px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${currentResponse === opt.val ? "rgba(0,201,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                background: currentResponse === opt.val ? "rgba(0,201,255,0.12)" : "rgba(255,255,255,0.03)",
                color: currentResponse === opt.val ? "#00C9FF" : "rgba(255,255,255,0.5)",
                transition: "all 0.15s",
              }}>
                {opt.label}
              </button>
```

with:

```tsx
              <button key={opt.val} onClick={() => handleResponse(opt.val)} disabled={licenseBlocked} style={{
                flex: 1, padding: "10px 6px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                cursor: licenseBlocked ? "not-allowed" : "pointer",
                border: `1px solid ${currentResponse === opt.val ? "rgba(0,201,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                background: currentResponse === opt.val ? "rgba(0,201,255,0.12)" : "rgba(255,255,255,0.03)",
                color: currentResponse === opt.val ? "#00C9FF" : "rgba(255,255,255,0.5)",
                opacity: licenseBlocked ? 0.6 : 1,
                transition: "all 0.15s",
              }}>
                {opt.label}
              </button>
```

In the `<textarea` (lines 616–628) add `disabled={licenseBlocked}` after `onBlur={handleNoteBlur}`:

```tsx
            onBlur={handleNoteBlur}
            disabled={licenseBlocked}
```

Replace the opening tag of the final navigation button (lines 744–752, through the closing `>`):

```tsx
          <button
            onClick={step < controls.length - 1 ? handleNext : handleSubmit}
            disabled={saving}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: saving ? "rgba(0,201,255,0.3)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
              color: saving ? "rgba(255,255,255,0.5)" : "#050B18", border: "none",
            }}
          >
```

with:

```tsx
          <button
            onClick={step < controls.length - 1 ? handleNext : handleSubmit}
            disabled={saving || (licenseBlocked && step === controls.length - 1)}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: saving || (licenseBlocked && step === controls.length - 1) ? "not-allowed" : "pointer",
              background: saving || (licenseBlocked && step === controls.length - 1) ? "rgba(0,201,255,0.3)" : "linear-gradient(135deg, #00C9FF, #4DFFA0)",
              color: saving || (licenseBlocked && step === controls.length - 1) ? "rgba(255,255,255,0.5)" : "#050B18", border: "none",
            }}
          >
```

- [ ] **Step 12: Manual check** — as a client with no license (void their row in the admin panel): the assessment page shows the amber "No active license…" banner, response buttons, notes, uploads, checkboxes and delete are disabled, Next still pages through controls, and the last step's submit button is disabled. Assign a package: reload, banner gone, editing works. Start a reassessment (admin button) for a finalized client: each previously answered control shows `Last cycle: Yes/Partial/No/N/A`.

- [ ] **Step 13: Type-check and commit**

```
npx tsc --noEmit
git add app/portal/assessment/page.tsx
git commit -m "feat(portal): license banner, disabled editing, previous-cycle reference on the assessment page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 19: Scoping and Documents pages — banner and disabled controls

**Files:**
- Modify: `app/portal/scoping/page.tsx` (imports line 5; state lines 26–32; init line 50; `save` lines 63–79; render lines 91–99 and 166–191)
- Modify: `app/portal/documents/page.tsx` (imports line 4; state lines 40–46; `load` lines 48–55; handlers 59–105; render 109–149, 182–200, 236–247)
- Test: smoke test renders both pages (Task 24); manual check in Step 5.

- [ ] **Step 1: Scoping page edits**

After line 5 (`import { SCOPING_QUESTIONS } from "@/lib/scoping-questions";`) add:

```ts
import LicenseBanner, { NO_LICENSE, isLicenseInactiveResponse, markInactive, type PortalEntitlement } from "@/components/LicenseBanner";
```

Replace line 28 (`const [editable, setEditable] = useState(true);`) with:

```ts
  const [statusEditable, setStatusEditable] = useState(true);
  const [entitlement, setEntitlement] = useState<PortalEntitlement>(NO_LICENSE);
```

Replace line 50 (`setEditable([...].includes(...));`) with:

```ts
      setStatusEditable(["in_progress", "remediation_required"].includes(data.assessmentStatus ?? "in_progress"));
      setEntitlement(data.entitlement ?? NO_LICENSE);
```

Replace `save` (lines 63–79) with:

```ts
  async function save() {
    if (!assessmentId || !entitlement.canEdit) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/scoping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, answers }),
    });
    if (!res.ok) {
      const data = await res.json();
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
      else setError(data.error ?? "Save failed");
    } else {
      setSavedAt(new Date().toLocaleTimeString());
    }
    setSaving(false);
  }

  const licenseBlocked = !entitlement.canEdit;
  const editable = statusEditable && !licenseBlocked;
```

Replace lines 91–93:

```tsx
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Environment Scoping</div>
```

with:

```tsx
  return (
    <div style={{ maxWidth: 760 }}>
      {entitlement.status !== "active" && <LicenseBanner status={entitlement.status} />}
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Environment Scoping</div>
```

Replace the read-only fallback (lines 187–191):

```tsx
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Your assessment has been submitted — scoping is read-only until it reopens.
          </div>
        )}
```

with:

```tsx
        ) : licenseBlocked ? (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Scoping is read-only until a package is assigned.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            Your assessment has been submitted — scoping is read-only until it reopens.
          </div>
        )}
```

- [ ] **Step 2: Documents page edits**

After line 4 (`import { CONTROLS } from "@/lib/controls";`) add:

```ts
import LicenseBanner, { NO_LICENSE, isLicenseInactiveResponse, markInactive, type PortalEntitlement } from "@/components/LicenseBanner";
```

After line 46 (`const fileRef = useRef<HTMLInputElement>(null);`) add:

```ts
  const [entitlement, setEntitlement] = useState<PortalEntitlement>(NO_LICENSE);
  const licenseBlocked = !entitlement.canEdit;
```

Replace `load` (lines 48–55) with:

```ts
  const load = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents ?? []);
      setEntitlement(data.entitlement ?? NO_LICENSE);
    }
    setLoaded(true);
  }, []);
```

Replace the four handlers `handleUpload`, `analyze`, `resolveLink`, `removeDocument` (lines 59–105) with:

```ts
  async function handleUpload(file: File) {
    if (licenseBlocked) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
      else setError(data.error ?? "Upload failed");
    } else {
      await load();
      // Kick off AI mapping right away so suggestions appear without an extra click
      analyze(data.document.id);
    }
    setUploading(false);
  }

  async function analyze(documentId: string) {
    if (licenseBlocked) return;
    setAnalyzing(documentId);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/documents/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
      else setError(data.error ?? "Analysis failed");
    } else {
      setNotice(`Analysis complete: ${data.suggested} control suggestion(s). Review and confirm them below.`);
    }
    await load();
    setAnalyzing(null);
  }

  async function resolveLink(documentId: string, controlId: string, action: "confirm" | "reject") {
    if (licenseBlocked) return;
    const res = await fetch("/api/documents/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, controlId, action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
    }
    await load();
  }

  async function removeDocument(documentId: string, fileName: string) {
    if (licenseBlocked) return;
    if (!window.confirm(`Delete "${fileName}" and its control mappings?`)) return;
    const res = await fetch(`/api/documents?documentId=${documentId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (isLicenseInactiveResponse(res, data)) setEntitlement(markInactive);
    }
    await load();
  }
```

Replace lines 109–111:

```tsx
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Document Library</div>
```

with:

```tsx
  return (
    <div>
      {loaded && entitlement.status !== "active" && <LicenseBanner status={entitlement.status} />}
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Document Library</div>
```

Replace the upload button (lines 130–145) with:

```tsx
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading || licenseBlocked}
          style={{
            background: uploading || licenseBlocked ? "rgba(0,201,255,0.3)" : "#00C9FF",
            color: "#050B18",
            fontWeight: 700,
            fontSize: 14,
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            cursor: uploading || licenseBlocked ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Uploading…" : "+ Upload Document"}
        </button>
```

Replace the Re-analyze and Delete buttons (lines 182–200) with:

```tsx
                <button
                  onClick={() => analyze(doc.id)}
                  disabled={analyzing === doc.id || licenseBlocked}
                  style={{
                    background: "rgba(0,201,255,0.12)", color: "#00C9FF", border: "1px solid rgba(0,201,255,0.35)",
                    borderRadius: 6, padding: "6px 14px", fontSize: 12,
                    cursor: licenseBlocked ? "not-allowed" : "pointer", opacity: licenseBlocked ? 0.5 : 1,
                  }}
                >
                  {analyzing === doc.id ? "Analyzing…" : "Re-analyze"}
                </button>
                <button
                  onClick={() => removeDocument(doc.id, doc.file_name)}
                  disabled={licenseBlocked}
                  style={{
                    background: "rgba(248,113,113,0.1)", color: "#F87171", border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 6, padding: "6px 14px", fontSize: 12,
                    cursor: licenseBlocked ? "not-allowed" : "pointer", opacity: licenseBlocked ? 0.5 : 1,
                  }}
                >
                  Delete
                </button>
```

Replace the Confirm and Dismiss buttons (lines 236–247) with:

```tsx
                    <button onClick={() => resolveLink(doc.id, l.control_id, "confirm")} disabled={licenseBlocked} style={{
                      background: "rgba(77,255,160,0.12)", color: "#4DFFA0", border: "1px solid rgba(77,255,160,0.35)",
                      borderRadius: 6, padding: "4px 12px", fontSize: 12,
                      cursor: licenseBlocked ? "not-allowed" : "pointer", opacity: licenseBlocked ? 0.5 : 1,
                    }}>
                      Confirm
                    </button>
                    <button onClick={() => resolveLink(doc.id, l.control_id, "reject")} disabled={licenseBlocked} style={{
                      background: "transparent", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 6, padding: "4px 12px", fontSize: 12,
                      cursor: licenseBlocked ? "not-allowed" : "pointer", opacity: licenseBlocked ? 0.5 : 1,
                    }}>
                      Dismiss
                    </button>
```

- [ ] **Step 3: Type-check**

```
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Manual check** — as a client with no license: `/portal/scoping` shows the banner, fields disabled, "Scoping is read-only until a package is assigned."; `/portal/documents` shows the banner and Upload / Re-analyze / Delete / Confirm / Dismiss are disabled. `/portal/reports` and `/portal/deliverables` are unchanged and still download.

- [ ] **Step 5: Commit**

```
git add app/portal/scoping/page.tsx app/portal/documents/page.tsx
git commit -m "feat(portal): license banner and disabled controls on scoping and documents" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 20: Profile — Purchases section

**Files:**
- Modify: `app/portal/profile/page.tsx` (whole file, 16 lines)
- Test: smoke test renders `/portal/profile` with and without a client record (Task 24).

- [ ] **Step 1: Replace the file with:**

```tsx
import { createServerSupabaseClient } from "@/lib/supabase-server";
import ProfileView from "@/components/ProfileView";
import { formatShortDate } from "@/lib/licensing";

type Purchase = {
  id: string;
  type: string;
  price_paid_usd: number | string;
  starts_at: string;
  expires_at: string;
  voided_at: string | null;
  void_reason: string | null;
  packages: { name: string } | { name: string }[] | null;
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: 24,
  marginTop: 24,
};

const thStyle: React.CSSProperties = {
  textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600,
  letterSpacing: "1px", textTransform: "uppercase", padding: "0 8px 10px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const tdStyle: React.CSSProperties = { padding: "10px 8px 10px 0", fontSize: 13, color: "rgba(255,255,255,0.6)" };

function packageName(p: Purchase): string {
  const pkg = Array.isArray(p.packages) ? p.packages[0] : p.packages;
  return pkg?.name ?? "";
}

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Reads through RLS: client_licenses_client_read and packages_read_authenticated.
  let purchases: Purchase[] = [];
  if (user) {
    const { data: client } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (client) {
      const { data } = await supabase
        .from("client_licenses")
        .select("id, type, price_paid_usd, starts_at, expires_at, voided_at, void_reason, packages(name)")
        .eq("client_id", client.id)
        .order("starts_at", { ascending: false });
      purchases = (data ?? []) as unknown as Purchase[];
    }
  }

  return (
    <div>
      <ProfileView
        email={user?.email}
        fullName={user?.user_metadata?.full_name ?? null}
        role="client"
        note="Contact Galaxy Consulting to update your account details."
      />

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Purchases</div>
        {purchases.length === 0 ? (
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No purchases yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Package", "Purchased", "Expires", "Price paid", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", opacity: p.voided_at ? 0.55 : 1 }}>
                  <td style={{ ...tdStyle, color: "#fff", fontWeight: 600 }}>{packageName(p)}</td>
                  <td style={tdStyle}>{formatShortDate(p.starts_at)}</td>
                  <td style={tdStyle}>{formatShortDate(p.expires_at)}</td>
                  <td style={tdStyle}>${Number(p.price_paid_usd).toFixed(2)}</td>
                  <td style={tdStyle}>
                    {p.voided_at && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, color: "#F87171", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
                        Voided
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```
npx tsc --noEmit
git add app/portal/profile/page.tsx
git commit -m "feat(portal): Purchases section on the profile page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Chunk 5 — Cron expiry job (after chunk 1; parallel with 2, 3, 4)

## Task 21: 14-day license expiry reminders in the daily cron

**Files:**
- Modify: `app/api/cron/reaffirmation/route.ts` (imports lines 2–4; constants line 9; replace the final `return` at line 66 with the second job)
- Test: none automated (the cron sends e-mail and is protected by `CRON_SECRET`); manual check in Step 3.

- [ ] **Step 1: Replace lines 1–9 (imports and constant) with:**

```ts
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { sendReaffirmationReminderEmail, sendLicenseExpiringEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { formatLongDate } from "@/lib/licensing";

export const maxDuration = 60;

// Remind clients ~11 months after finalization (annual affirmation cycle).
const REMIND_AFTER_DAYS = 335;

// Remind clients (and the admin) this many days before their license expires.
const LICENSE_EXPIRY_WINDOW_DAYS = 14;
```

- [ ] **Step 2: Replace the final `return NextResponse.json({ success: true, reminded: sent, considered: due?.length ?? 0 });` (line 66) with the second job:**

```ts
  // ---- Job 2: license expiry reminders — once per license, 14 days out ----
  const nowIso = new Date().toISOString();
  const windowEndIso = new Date(Date.now() + LICENSE_EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiring, error: licenseError } = await svc
    .from("client_licenses")
    .select("id, client_id, starts_at, expires_at, clients(company_name, contact_name, user_id), packages(name)")
    .is("voided_at", null)
    .is("expiry_reminded_at", null)
    .gt("expires_at", nowIso)
    .lte("expires_at", windowEndIso)
    .limit(100);

  if (licenseError) return NextResponse.json({ error: licenseError.message }, { status: 500 });

  let licensesReminded = 0;
  for (const l of expiring ?? []) {
    // Skip rows that are no longer the client's current license (a newer
    // non-voided row exists) and stamp them so they are not reconsidered.
    const { data: newer } = await svc
      .from("client_licenses")
      .select("id")
      .eq("client_id", l.client_id)
      .is("voided_at", null)
      .gt("starts_at", l.starts_at)
      .limit(1);
    if ((newer ?? []).length > 0) {
      await svc.from("client_licenses").update({ expiry_reminded_at: nowIso }).eq("id", l.id);
      continue;
    }

    const client = (Array.isArray(l.clients) ? l.clients[0] : l.clients) as {
      company_name: string;
      contact_name: string;
      user_id: string;
    } | null;
    const pkg = (Array.isArray(l.packages) ? l.packages[0] : l.packages) as { name: string } | null;

    if (client) {
      const { data: authUser } = await svc.auth.admin.getUserById(client.user_id);
      if (authUser?.user?.email) {
        await sendLicenseExpiringEmail({
          clientEmail: authUser.user.email,
          clientName: client.contact_name,
          companyName: client.company_name,
          packageName: pkg?.name ?? "Assessment",
          expiresOn: formatLongDate(l.expires_at as string),
        });
      }
    }

    await svc.from("client_licenses").update({ expiry_reminded_at: nowIso }).eq("id", l.id);
    logAudit({
      actorId: null,
      actorRole: "system",
      action: "license.expiry_reminded",
      entityType: "license",
      entityId: l.id,
      metadata: { clientId: l.client_id, expiresAt: l.expires_at },
    });
    licensesReminded++;
  }

  return NextResponse.json({
    success: true,
    reminded: sent,
    considered: due?.length ?? 0,
    licensesReminded,
    licensesConsidered: expiring?.length ?? 0,
  });
```

- [ ] **Step 3: Manual check** — with `npm run dev` running and `CRON_SECRET` set in `.env.local`, in PowerShell:

```
Invoke-RestMethod -Uri "http://localhost:3000/api/cron/reaffirmation" -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

Expected: `{ success: true, reminded: 0, considered: 0, licensesReminded: 0, licensesConsidered: 0 }` (grandfathered licenses expire in ~3 months, outside the 14-day window). To exercise the job, in the Supabase SQL editor run `update client_licenses set expires_at = now() + interval '10 days' where notes = 'Grandfathered at licensing launch' and client_id = '<one client id>';`, call the endpoint again (`licensesReminded: 1`, one `license.expiry_reminded` audit row, e-mails sent when `RESEND_API_KEY` is set), call it a third time (`licensesReminded: 0` — the stamp is idempotent), then restore `expires_at`.

- [ ] **Step 4: Type-check and commit**

```
npx tsc --noEmit
git add app/api/cron/reaffirmation/route.ts
git commit -m "feat(cron): 14-day license expiry reminders" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

# Chunk 6 — Documentation, smoke test, verification (last)

## Task 22: SRS 1.1, Word export, README, known gaps

**Files:**
- Modify: `docs/SRS.md` (header lines 7–8; 4.2 lines 225–231 and SEC-05 line 236; 5.3 lines 348–349; new 10.4 after line 578; 11.1 after line 605; 11.2 after line 614; 11.3 line 630; 13 after line 677; 15.1 lines 685–687; 15.2 lines 691–693; 16 after line 749)
- Modify: `scripts/build-srs-docx.mjs` (OUTPUT, document title, running header)
- Delete: `docs/Galaxy_CMMC_Portal_SRS_v1.0.docx`; Create (generated): `docs/Galaxy_CMMC_Portal_SRS_v1.1.docx`
- Modify: `README.md` (lines 9, 15; migration table after line 85)
- Modify: `docs/SRS-known-gaps.md` (header lines 6–8; gap 3 lines 85–86; new item 8 after line 174; change log after line 192)

- [ ] **Step 1: SRS header** — replace lines 7–8:

```
| **Version** | 1.1 |
| **Date** | September 25, 2026 |
```

- [ ] **Step 2: SRS 4.2 capability matrix** — replace lines 225–231 (from `| View SPRS scores, AI verdicts, analytics | ✅ | ✅ | — |` through `| **Access the \`/admin/*\` area** | ✅ | — | — |`) with:

```
| View SPRS scores, AI verdicts, analytics | ✅ | ✅ | — |
| View licenses and purchase history | ✅ | ✅ | own only |
| Change own password | ✅ | ✅ | ✅ |
| **Create / edit / disable / delete client accounts** | ✅ | — | — |
| **Reset a client's password** | ✅ | — | — |
| **Invite assessor accounts** | ✅ | — | — |
| **Assign an assessor to an assessment** | ✅ | — | — |
| **Manage the package catalog** | ✅ | — | — |
| **Assign and void client licenses** | ✅ | — | — |
| **Access the `/admin/*` area** | ✅ | — | — |
```

and in SEC-05 change `final four rows above` to `final six rows above`.

- [ ] **Step 3: SRS 5.3** — replace lines 348–349 (FR-CL-09) with:

```
**FR-CL-09** — Responses **shall** be saved incrementally (upsert per control),
so a partially completed assessment is never lost. The server **shall** accept a
save only from the assessment's owning client, only while the assessment is
`in_progress` or `remediation_required`, and only under an active license
(Section 10.4); other callers receive 403 and other states 400.
```

- [ ] **Step 4: SRS 10.4** — insert after line 578 (`by \`assessments.reaffirmation_reminded_at\`.`), before the `---` that precedes `## 11. Data Model`:

```

### 10.4 Licensing and Packages

Clients purchase one of three package types offline (invoice, purchase order or
check). An administrator records the purchase in the portal, which activates
the license. Entitlement is derived from the purchase ledger; nothing is stored
on the client record.

| Package | Duration | Allows |
|---|---|---|
| Single Assessment | 3 months | One assessment cycle |
| Additional Assessment | 3 months | One more assessment cycle after a prior license |
| Unlimited | 12 months | Any number of cycles; the client starts each new cycle |

**FR-LC-01** — The system **shall** keep an admin-editable package catalog with
name, type (single, additional, unlimited), price in USD, duration in months,
description, and active flag, with at most one active package per type.

**FR-LC-02** — The system **shall** record each purchase as an append-only
license ledger row with package, type snapshot, price paid, start, expiry,
granting admin, and notes.

**FR-LC-03** — A license **shall** start when assigned and expire after the
package duration in calendar months. A new license **shall not** stack on
remaining time.

**FR-LC-04** — A Single Assessment license **shall** be assignable only to a
client with no prior non-voided license. An Additional Assessment license
**shall** require at least one. An Unlimited license **shall** be assignable at
any time.

**FR-LC-05** — Assigning a Single or Additional license **shall** open a new
cycle when the latest cycle is finalized, and reuse the latest cycle when it is
unfinished.

**FR-LC-06** — A client's entitlement **shall** be derived from their latest
non-voided license by start date: none, active, or expired.

**FR-LC-07** — Without an active license, a client **shall not** be able to save
answers, upload or delete evidence, change the document library, save scoping,
respond to information requests, or submit. The server **shall** return 403
`license_inactive`.

**FR-LC-08** — Without an active license, a client **shall** keep login, read
access to past answers, and download access to existing reports and
deliverables.

**FR-LC-09** — A client with an active Unlimited license **shall** be able to
start a new cycle once the latest cycle is finalized. Previous answers **shall**
carry forward and be shown as a reference.

**FR-LC-10** — An admin **shall** be able to void a license with a reason.
Voided licenses **shall** be ignored for entitlement.

**FR-LC-11** — The daily cron **shall** email the client and the admin once, 14
days before a client's current license expires.

**FR-LC-12** — Clients **shall** see their license status, expiry, and purchase
history, and **shall** be able to request a package, which emails the admin.

**FR-LC-13** — License assignment, voiding, requests, and expiry reminders
**shall** be written to the audit log.
```

- [ ] **Step 5: SRS 11.1** — insert after line 605 (`| \`audit_log\` | Append-only action trail |`):

```
| `packages` | Admin-editable package catalog: type, price, duration in months, description, active flag |
| `client_licenses` | Append-only license ledger: one row per purchase with type snapshot, price paid, start, expiry, granting admin, linked cycle, void state |
```

- [ ] **Step 6: SRS 11.2** — insert after line 614 (`| \`clients.engagement_type\` | \`assessment\`, \`remediation\` |`):

```
| `packages.type` / `client_licenses.type` | `single`, `additional`, `unlimited` |
```

- [ ] **Step 7: SRS 11.3** — on line 630 change `Twenty migrations exist` to `Twenty-three migrations exist`.

- [ ] **Step 8: SRS 13** — insert after line 677 (`| Automated staging environment | Single production Supabase project |`):

```
| Online payment | Purchases are paid offline and recorded by an administrator. No card data is handled. |
```

- [ ] **Step 9: SRS 15.1 and 15.2** — replace lines 685–687 (VER-01) with:

```
**VER-01** — `npm test` (Vitest) **shall** cover SPRS scoring rules, catalog
integrity (110 requirements, 17 Level 1 practices, 320 objectives), upload
validation, licensing entitlement and assignment rules, and the ownership,
status and license checks on the client write routes (answer save, submit,
evidence upload, scoping, start cycle) with a mocked database client. Seventy
tests as of this version.
```

and replace lines 691–693 (VER-02) with:

```
**VER-02** — `npm run smoke [baseUrl]` **shall** sign in as an admin, an
assessor and a client, and request every `app/**/page.tsx` route as its owning
role. Thirty-nine checks as of this version.
```

- [ ] **Step 10: SRS 16** — insert after line 749 (the 1.0 change-log row):

```
| 1.1 | 2026-09-25 | Client licensing and packages (FR-LC-01–13, §10.4): package catalog, append-only license ledger, entitlement-gated client writes, admin assignment and voiding, client-started Unlimited cycles, 14-day expiry reminders. Answer save now checks ownership and status (FR-CL-09). Route tests for the client write paths (VER-01). |
```

- [ ] **Step 11: Word export script** — in `scripts/build-srs-docx.mjs` change:

```js
const OUTPUT = path.join(ROOT, "docs", "Galaxy_CMMC_Portal_SRS_v1.0.docx");
```
to
```js
const OUTPUT = path.join(ROOT, "docs", "Galaxy_CMMC_Portal_SRS_v1.1.docx");
```

```js
  title: "Galaxy CMMC Portal — System Requirements Specification v1.0",
```
to
```js
  title: "Galaxy CMMC Portal — System Requirements Specification v1.1",
```

```js
            text: "Galaxy CMMC Portal — SRS v1.0",
```
to
```js
            text: "Galaxy CMMC Portal — SRS v1.1",
```

- [ ] **Step 12: Regenerate the Word export (OPS-05: same commit as the Markdown change)**

```
git rm docs/Galaxy_CMMC_Portal_SRS_v1.0.docx
npm run docs:srs-docx
```

Expected: `Wrote docs/Galaxy_CMMC_Portal_SRS_v1.1.docx (… KB) from docs/SRS.md`. Verify no internal content leaked: open the .docx (or `npx mammoth docs/Galaxy_CMMC_Portal_SRS_v1.1.docx --output-format=markdown | Select-String "Known Gaps"`) — no match.

- [ ] **Step 13: README** — on line 9 change `(v1.0)` to `(v1.1)`; on line 15 change `Galaxy_CMMC_Portal_SRS_v1.0.docx` to `Galaxy_CMMC_Portal_SRS_v1.1.docx`; insert after line 85 (the `022_reassessment.sql` row):

```
| `023_licensing.sql` | `packages` catalog and `client_licenses` ledger with RLS, seed packages, grandfathered Single Assessment license for every client with an assessment |
```

- [ ] **Step 14: Known gaps** — replace lines 6–8 with:

```
| **Version** | 1.1 |
| **Date** | September 25, 2026 |
| **Companion to** | [SRS.md](SRS.md) v1.1 |
```

Replace lines 85–86 (gap 3 "Currently compensating") with:

```
**Currently compensating.** Unit tests cover scoring and catalog integrity —
the pure logic. Since 2026-09-25, `tests/license-gates.test.ts` calls the
answer-save, submit, evidence-upload, scoping and start-cycle handlers directly
against an in-memory Supabase stand-in (`tests/helpers/fake-supabase.ts`),
covering ownership, status and license checks for each. Lifecycle transitions,
determinations, remediation approval and artifact generation remain manual.
```

Insert after line 174 (the end of item 7, before `## Open decisions`):

```
---

## 8. Answer save trusted the caller — fixed 2026-09-25

**Severity:** High (closed)

**Gap.** `POST /api/assessment` (the per-control answer save) upserted into
`assessment_responses` through the service-role client with no check that the
assessment belonged to the caller and no check of the assessment's status. Any
signed-in user who knew an assessment id could write answers into it, including
a finalized one.

**Why it mattered.** Every other client write route verified ownership; this
one was the exception, and it is the one the portal calls most. RLS did not
help because the service-role client bypasses it (SEC-09).

**Resolution.** The route now loads the assessment, requires
`clients.user_id === user.id` (403 `Forbidden`), requires status `in_progress`
or `remediation_required` (400), and requires an active license (403
`license_inactive`). Covered by `tests/license-gates.test.ts`. Recorded as
FR-CL-09 and FR-LC-07 in `SRS.md`.

```

Append after line 192 (the 1.0 change-log row):

```
| 1.1 | 2026-09-25 | Item 8 (answer-save ownership/status gap) recorded and closed with the licensing work. Item 3 updated for the new route tests. |
```

- [ ] **Step 15: Commit (Markdown and Word export together)**

```
git add docs/SRS.md docs/Galaxy_CMMC_Portal_SRS_v1.1.docx scripts/build-srs-docx.mjs README.md docs/SRS-known-gaps.md
git commit -m "docs: SRS 1.1 — licensing and packages (FR-LC-01..13); regenerate Word export; known gaps 1.1" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 23: Smoke test — `/admin/packages` must turn an assessor away

**Files:**
- Modify: `scripts/smoke-test.mjs` (line 284)
- Test: `npm run smoke` in Task 24

- [ ] **Step 1: Replace line 284**

```js
    for (const route of ["/admin/dashboard", "/admin/team", `/admin/clients/${clientIdForRoutes}`]) {
```

with:

```js
    for (const route of ["/admin/dashboard", "/admin/team", "/admin/packages", `/admin/clients/${clientIdForRoutes}`]) {
```

(The route itself is discovered from `app/admin/packages/page.tsx` automatically and rendered as admin — VER-04.)

- [ ] **Step 2: Commit**

```
git add scripts/smoke-test.mjs
git commit -m "test(smoke): /admin/packages is admin-only" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

## Task 24: Final verification — build, unit tests, smoke

**Files:** none modified unless a check fails.

- [ ] **Step 1: Type-check and build**

```
npx tsc --noEmit
npm run build
```

Expected: tsc prints nothing. `next build` ends with the route table and `○ (Static)` / `λ (Dynamic)` legend, listing `/admin/packages`, `/api/admin/packages`, `/api/admin/clients/[id]/licenses`, `/api/admin/licenses/[id]/void`, `/api/assessment/start-cycle`, `/api/licenses/request`; no type or lint errors.

- [ ] **Step 2: Unit and route tests**

```
npm test
```

Expected:

```
 ✓ tests/catalog.test.ts
 ✓ tests/scoring.test.ts
 ✓ tests/uploads.test.ts
 ✓ tests/licensing.test.ts (25 tests)
 ✓ tests/license-gates.test.ts (20 tests)

 Test Files  5 passed (5)
      Tests  70 passed (70)
```

If the total differs from 70, the number in `docs/SRS.md` VER-01 (Task 22 Step 9) is wrong: correct it to the printed total and re-run `npm run docs:srs-docx`, amending the docs commit.

- [ ] **Step 3: Smoke test against the production build** (two shells; the smoke test writes throwaway records to the real Supabase project and removes them)

Shell 1:
```
npm start
```

Shell 2:
```
npm run smoke
```

Expected: every line `PASS`, including `admin    /admin/packages`, `assessor /admin/packages (admin-only)`, `client   /portal/dashboard`, `client   /portal/profile (no client record)`, and both `/assessor/clients/[id]` parity lines; final line `39/39 passed` then `All routes rendered.`. If the count differs from 39, correct VER-02 in `docs/SRS.md` (Task 22 Step 9), regenerate the Word export and amend the docs commit.

- [ ] **Step 4: Confirm cleanup left nothing behind**

```
npm run smoke:cleanup
```

Expected: `Nothing to clean up.`

- [ ] **Step 5: Working tree is clean**

```
git status --short
```

Expected: no output.

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| §3.1 `packages`, §3.2 `client_licenses`, §3.3 RLS, §3.4 grandfathering | 1 |
| §4 `computeEntitlement`, `planAssignment`, `addMonths`, `getEntitlement`, `requireClientLicense` | 2 |
| §5 `startReassessmentCycle`, reassess route refactored | 3 |
| §6.1 gates: answer save (+ownership/status fix), submit, artifacts POST/DELETE | 7 |
| §6.1 gates: scoping | 7 |
| §6.1 gates: info-requests respond, documents POST/DELETE/links/analyze | 8 |
| §6.2 reads stay open (only writes gated; first-cycle auto-create unchanged) | 5, 7, 8 |
| §6.3 `GET /api/assessment` `previousResponses`, `entitlement` | 5 |
| §6.4 `POST /api/assessment/start-cycle` (`license_inactive`, `unlimited_required`) | 14 |
| §6.4 `POST /api/licenses/request` (`license.requested`) | 15 |
| §6.5 `GET/POST/PUT /api/admin/packages` (409) | 9 |
| §6.5 `GET/POST /api/admin/clients/[id]/licenses` (assign steps 1–8, `license.assigned`) | 10 |
| §6.5 `POST /api/admin/licenses/[id]/void` (`license.voided`) | 10 |
| §6.6 cron (`licensesReminded`, `license.expiry_reminded`, skip superseded rows) | 21 |
| §7.1 Packages page + nav | 11 |
| §7.2 LicensingPanel (badge, history, assign with confirm, void modal, `readOnly`) | 12 |
| §7.3 License column on clients list and dashboard | 13 |
| §7.4 Assessor mirror | 12 |
| §8.1 Dashboard License card + Request package | 17 |
| §8.2 Inactive banner on assessment, documents, scoping; controls disabled; `license_inactive` handling | 18, 19 |
| §8.3 Request package modal | 16 |
| §8.4 Start new assessment card + finalized-state copy | 17, 18 |
| §8.5 Previous-cycle reference ("Last cycle: Yes") | 18 |
| §8.6 Profile Purchases (RLS read) | 20 |
| §9 `sendPackageAssignedEmail`, `sendLicenseExpiringEmail`, `sendPackageRequestEmail`; no new env vars | 4 |
| §10.1 SRS 10.4 FR-LC-01..13, 4.2 rows, 5.3, 11.1/11.2/11.3, 13, 16, Word export | 22 |
| §10.2 known gaps (answer-save fix; gap 3 tests) | 22 |
| §11.1 unit tests | 2 |
| §11.2 route tests (5 routes × 4 cases) | 6, 7, 14 |
| §11.3 smoke `/admin/packages` admin-only; build/test/smoke pass | 23, 24 |
| FR-LC-01 catalog | 1, 9, 11 |
| FR-LC-02 ledger | 1, 10 |
| FR-LC-03 clock starts on assignment, no stacking | 2 (`addMonths`), 10 |
| FR-LC-04 assignability | 2 (`planAssignment`), 10, 12 |
| FR-LC-05 open/reuse cycle | 2, 3, 10 |
| FR-LC-06 entitlement | 2 |
| FR-LC-07 gated writes, `license_inactive` | 7, 8 |
| FR-LC-08 reads and downloads stay open | 5, 7, 8 (no read route is gated) |
| FR-LC-09 Unlimited start cycle, carry forward, reference | 3, 14, 17, 18 |
| FR-LC-10 void | 10, 12 |
| FR-LC-11 14-day reminder once | 21 |
| FR-LC-12 client sees status/history, can request | 15, 16, 17, 20 |
| FR-LC-13 audit: `license.assigned`, `license.voided`, `license.requested`, `license.expiry_reminded` | 10, 15, 21 |

Names used consistently across tasks: `lib/licensing.ts` (`LicenseType`, `LicenseRow`, `Entitlement`, `AssignmentPlan`, `addMonths`, `hasPriorLicense`, `computeEntitlement`, `planAssignment`, `toLicenseRows`, `loadLicenseContext`, `getEntitlement`, `requireClientLicense`, `formatLongDate`, `formatShortDate`, `entitlementSummary`); `lib/reassessment.ts` (`startReassessmentCycle`); errors `license_inactive`, `unlimited_required`, `single_requires_no_prior_license`, `additional_requires_prior_license`; audit `license.assigned`, `license.voided`, `license.requested`, `license.expiry_reminded`; emails `sendPackageAssignedEmail`, `sendLicenseExpiringEmail`, `sendPackageRequestEmail`; migration `023_licensing.sql`; components `LicensingPanel`, `LicenseBanner` (`PortalEntitlement`, `NO_LICENSE`, `isLicenseInactiveResponse`, `markInactive`), `RequestPackageButton`, `StartCycleButton`.
