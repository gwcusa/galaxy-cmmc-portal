# Client Licensing and Packages: Design Spec

- **Date:** 2026-09-25
- **Status:** Approved by the product owner, section by section
- **Project:** Galaxy CMMC 2.0 compliance portal (`galaxy-p`)
- **Scope:** Package catalog, license ledger, entitlement enforcement, admin and portal UI, expiry reminders, SRS updates

## 1. Goal

The admin sets up billing packages. Clients buy one of three license types:

| Package | Duration | What it allows |
|---|---|---|
| Single Assessment | 3 months | One assessment cycle |
| Additional Assessment (pay as you go) | 3 months | One more assessment cycle after a prior license |
| Unlimited | 12 months | Any number of cycles; the client starts each new cycle |

Prior submitted answers carry forward across cycles. The client only updates the controls that changed.

## 2. Decisions

| Topic | Decision |
|---|---|
| Payment | Offline (invoice, PO, check). The admin records the purchase in the portal. Recording it activates the license. No Stripe and no PCI scope. |
| Stripe readiness | The ledger keeps full purchase history, so an online payment path can write the same rows later. |
| Expiry behavior | The client keeps login. They can view past answers and download reports and deliverables that already exist. They cannot edit answers, upload or delete evidence, change the document library, save scoping, answer information requests, or submit. This lasts until a new package is assigned. |
| Catalog | Editable. The admin sets name, price, duration in months, description, and active flag. Prices are shown to clients. |
| Clock | Starts on assignment. An Additional Assessment expires 3 months from the day it is assigned. It is not stacked on remaining time. |
| Unlimited cycles | The client starts a new cycle once the current cycle is finalized. Admin and assessor keep their existing Start Reassessment button. |
| Architecture | Approach A: package catalog plus license ledger. Rejected: two columns on `clients` (loses history); a Stripe-shaped schema now (premature). |
| Unit of use | One assessment is one `assessments` row (one cycle). Remediation resubmissions inside that cycle do not consume another license. |
| Mid-cycle top-up | An Additional Assessment assigned while the latest cycle is unfinished reuses that cycle. It does not start a new one. |

## 3. Data model

New migration `supabase/migrations/023_licensing.sql`. The latest existing migration is `022_reassessment.sql`.

### 3.1 `packages` (editable catalog)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, `default gen_random_uuid()` |
| `name` | `text not null` | Shown to clients |
| `type` | `text not null` | `check (type in ('single','additional','unlimited'))` |
| `price_usd` | `numeric(10,2) not null default 0` | `check (price_usd >= 0)` |
| `duration_months` | `integer not null` | `check (duration_months > 0)` |
| `description` | `text` | Shown to clients |
| `is_active` | `boolean not null default true` | Inactive packages cannot be assigned or requested |
| `sort_order` | `integer not null default 0` | Display order |
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | Set by the API on every update |

- Partial unique index: `create unique index packages_one_active_per_type on packages (type) where is_active;`
- The index guarantees at most one active package per type. The seed provides one of each, so each type starts with exactly one. If the admin deactivates the only package of a type, that type cannot be assigned until a package of that type is active again.
- Seed rows (prices 0 for the admin to set):

| name | type | duration_months | sort_order |
|---|---|---|---|
| Single Assessment | `single` | 3 | 1 |
| Additional Assessment | `additional` | 3 | 2 |
| Unlimited | `unlimited` | 12 | 3 |

### 3.2 `client_licenses` (ledger, one row per purchase)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key, `default gen_random_uuid()` |
| `client_id` | `uuid not null` | `references clients(id) on delete cascade` |
| `package_id` | `uuid not null` | `references packages(id)` |
| `type` | `text not null` | Snapshot of the package type at assignment. Same check as `packages.type`. |
| `price_paid_usd` | `numeric(10,2) not null default 0` | `check (price_paid_usd >= 0)` |
| `starts_at` | `timestamptz not null` | |
| `expires_at` | `timestamptz not null` | `check (expires_at > starts_at)` |
| `granted_by` | `uuid` | Admin's auth user id. Null for grandfathered rows. |
| `notes` | `text` | Invoice or PO number |
| `assessment_id` | `uuid` | `references assessments(id) on delete set null`. The cycle this purchase opened or reused. |
| `voided_at` | `timestamptz` | Null unless voided |
| `void_reason` | `text` | Required by the API when voiding |
| `expiry_reminded_at` | `timestamptz` | Set when the 14-day expiry email is sent |
| `created_at` | `timestamptz not null default now()` | |

- Index: `create index client_licenses_client_starts on client_licenses (client_id, starts_at desc);`
- The ledger is append-only from the app. The only permitted mutations are setting `voided_at` and `void_reason` (void route) and `expiry_reminded_at` (cron). No route deletes rows.

### 3.3 Row level security

RLS is enabled on both tables. Policies follow the existing `exists (select 1 from user_roles ...)` pattern.

| Table | Role | Select | Insert, update, delete |
|---|---|---|---|
| `client_licenses` | client | Own rows only: `exists (select 1 from clients c where c.id = client_licenses.client_id and c.user_id = auth.uid())` | None |
| `client_licenses` | admin, assessor | All rows: `exists (select 1 from user_roles where user_id = auth.uid() and role in ('admin','assessor'))` | None through RLS |
| `packages` | any authenticated user | All rows: `to authenticated using (true)` | None through RLS |

All writes go through `createServiceSupabaseClient()` from API routes, matching the existing pattern. The staff select policy names the `assessor` role explicitly, so it is not affected by known gap 1 in `docs/SRS-known-gaps.md`.

### 3.4 Grandfathering existing clients

The migration seeds one license for every existing client that has at least one `assessments` row:

| Field | Value |
|---|---|
| `package_id` | The seeded Single Assessment package |
| `type` | `single` |
| `price_paid_usd` | 0 |
| `starts_at` | `clients.created_at` |
| `expires_at` | `now() + interval '3 months'` (migration run time) |
| `granted_by` | null |
| `notes` | `Grandfathered at licensing launch` |
| `assessment_id` | null |

Clients with no assessment get no row. Their entitlement is `none`. The admin corrects any grandfathered row by voiding it and assigning the right package.

## 4. Entitlement logic (`lib/licensing.ts`)

### 4.1 Types and functions

```ts
type LicenseType = "single" | "additional" | "unlimited";

type Entitlement =
  | { status: "none"; canEdit: false; canStartCycle: false }
  | { status: "expired" | "active"; type: LicenseType; expiresAt: string;
      packageName: string; licenseId: string; canEdit: boolean; canStartCycle: boolean };

// Pure. Unit-tested.
computeEntitlement(licenses, latestAssessment, now): Entitlement
planAssignment({ packageType, hasPriorLicense, latestAssessment }): AssignmentPlan
addMonths(date, months): Date

// Reads through the service client, then calls computeEntitlement.
getEntitlement(svc, clientId): Promise<Entitlement>

// Route helper: returns null when allowed, or the 403 license_inactive response.
requireClientLicense(svc, clientId): Promise<NextResponse | null>
```

- `licenses` are the client's ledger rows joined to `packages.name`.
- `latestAssessment` is the client's latest non-archived `assessments` row by `started_at`, or null. This matches how `GET /api/assessment` picks the current cycle.
- `hasPriorLicense` is true when the client has at least one non-voided ledger row.

### 4.2 `computeEntitlement` rules

1. Ignore rows where `voided_at` is set.
2. Take the latest remaining row by `starts_at`.
3. No row: `none`.
4. `expires_at <= now`: `expired`, with that row's type, expiry and package name.
5. Otherwise: `active`, with that row's type, expiry and package name.
6. `canEdit` is true only when `active`.
7. `canStartCycle` is true only when `active`, type is `unlimited`, and `latestAssessment.status === 'finalized'`.

### 4.3 `addMonths`

Adds calendar months in UTC. If the target month is shorter, it clamps to that month's last day. Example: 2026-11-30 plus 3 months is 2027-02-28.

### 4.4 `planAssignment` rules

"Unfinished" means any status other than `finalized` and `archived`.

| Package type | Allowed when | Latest cycle | Cycle action | `assessment_id` |
|---|---|---|---|---|
| `single` | Client has no prior non-voided license | Finalized | Open a new cycle | New cycle id |
| `single` | Same | Unfinished | Reuse it | Latest cycle id |
| `single` | Same | None | None | null |
| `additional` | Client has at least one prior non-voided license | Finalized | Open a new cycle | New cycle id |
| `additional` | Same | Unfinished | Reuse it | Latest cycle id |
| `additional` | Same | None | None | null |
| `unlimited` | Always | Finalized | None (client starts cycles) | null |
| `unlimited` | Always | Unfinished | Reuse it | Latest cycle id |
| `unlimited` | Always | None | None | null |

- Every assignment sets `starts_at = now` and `expires_at = addMonths(now, package.duration_months)`.
- When no cycle exists, `GET /api/assessment` creates the first cycle on the client's first visit, as it does today.
- A rejected plan returns a reason code: `single_requires_no_prior_license` or `additional_requires_prior_license`.
- Cycles a client later starts under Unlimited do not change the ledger row. The ledger stays append-only.

## 5. Shared reassessment function (`lib/reassessment.ts`)

The cycle-opening logic now lives inline in `app/api/admin/assessment/[id]/reassess/route.ts`. It moves to:

```ts
startReassessmentCycle({
  svc, clientId, previousAssessmentId, actorUserId, actorRole, notifyClient,
}): Promise<{ ok: true; assessmentId: string; controlsCarried: number }
          | { ok: false; status: 400 | 404 | 500; error: string }>
```

It keeps today's behavior exactly:

- The previous assessment must exist, belong to `clientId`, and be `finalized`.
- It must still be the client's latest non-archived cycle (double-start guard).
- Insert a new `in_progress` row with `previous_assessment_id`.
- Copy `control_id, response, notes, no_artifacts, no_policy_document, no_implementation_artifact` from the previous cycle.
- Write the `assessment.reassessment_started` audit entry.
- When `notifyClient` is true, send `sendReassessmentStartedEmail` (fire and forget).

Callers:

| Caller | `actorRole` | `notifyClient` |
|---|---|---|
| Admin/assessor reassess route (refactored, behavior unchanged) | Caller's role | true |
| License assign route | `admin` | false (the package-assigned email covers it) |
| Client start-cycle route | `client` | false (the client started it) |

## 6. Server-side enforcement

### 6.1 Gated client write routes

Each gated route returns HTTP 403 with `{ "error": "license_inactive" }` when the caller is a client and the entitlement's `canEdit` is false. Staff callers are never gated by licenses.

| Route | Change |
|---|---|
| `POST /api/assessment` (`app/api/assessment/route.ts`) | Add an ownership check: the assessment's `client_id` must be the caller's `clients` row (`clients.user_id` equals the auth user), else 403 `Forbidden`. Require status `in_progress` or `remediation_required`, else 400. Then the license gate. This fixes the current gap where any logged-in user could write to any assessment through the service client. Only the portal calls this route. |
| `POST /api/assessment/submit` | License gate after the existing ownership and status checks |
| `POST /api/artifacts`, `DELETE /api/artifacts` | License gate after the existing ownership check |
| `POST /api/scoping` | License gate for non-staff callers, after the existing editable-status check |
| `POST /api/info-requests/[id]/respond` | License gate after the existing ownership check |
| `POST /api/documents`, `DELETE /api/documents` | License gate for non-staff callers |
| `POST /api/documents/links`, `POST /api/documents/analyze` | License gate for non-staff callers |

Check order on each route: 401 unauthenticated, 400 bad input, 404 not found, 403 not owner, 400 wrong status, 403 `license_inactive`.

### 6.2 Routes that stay open

- All reads, including `GET /api/assessment`, `GET /api/scoping`, `GET /api/artifacts`, `GET /api/documents`, and `GET /api/info-requests`.
- Report and deliverable downloads (`/api/reports`, `/api/artifacts-export/[id]`).
- The first-cycle auto-create in `GET /api/assessment`. It creates an empty cycle that the client cannot edit without a license.
- All admin and assessor routes. Staff can always review, change status, and finalize.

### 6.3 `GET /api/assessment` additions

The response gains two fields:

- `previousResponses`: when the current cycle has `previous_assessment_id`, the previous cycle's `control_id` and `response` rows. Otherwise an empty array.
- `entitlement`: the result of `getEntitlement` for the client.

### 6.4 New client routes

| Route | Behavior |
|---|---|
| `POST /api/assessment/start-cycle` | The caller must own a `clients` row, else 403 `Forbidden`. No active license: 403 `license_inactive`. Active but not unlimited: 403 `unlimited_required`. Latest cycle not finalized: 400. Otherwise calls `startReassessmentCycle` with the latest cycle id and returns `{ assessmentId }`. |
| `POST /api/licenses/request` | Body `{ packageId, message? }`. The package must be active. Sends `sendPackageRequestEmail` to `ADMIN_NOTIFY_EMAIL`. Writes audit entry `license.requested`. Open to clients in any entitlement state. |

### 6.5 New admin routes

| Route | Guard | Behavior |
|---|---|---|
| `GET /api/admin/packages` | `requireAdmin` | All packages ordered by `sort_order` |
| `POST /api/admin/packages` | `requireAdmin` | Create. Validates name, type, price >= 0, and duration > 0. Returns 409 if an active package of that type exists. |
| `PUT /api/admin/packages` | `requireAdmin` | Body `{ id, ...fields }`. Updates name, price, duration, description, active flag, and sort order. Returns 409 on the one-active-per-type index. Package type is not editable. |
| `GET /api/admin/clients/[id]/licenses` | `requireAdminOrAssessor` | Ledger rows with package name and granter email, plus the computed entitlement |
| `POST /api/admin/clients/[id]/licenses` | `requireAdmin` | Assign (steps below) |
| `POST /api/admin/licenses/[id]/void` | `requireAdmin` | Body `{ reason }`, required and non-empty. Sets `voided_at` and `void_reason`. 400 if already voided. Audit entry `license.voided`. Any linked cycle is left as is. |

Assign, `POST /api/admin/clients/[id]/licenses` with body `{ packageId, pricePaidUsd, notes }`:

1. Load the package. It must be active.
2. Load the client's ledger rows and latest non-archived cycle.
3. Run `planAssignment`. If not allowed, return 400 with the reason code.
4. If the plan opens a cycle, call `startReassessmentCycle` with `notifyClient: false`. Stop and return its error on failure.
5. Insert the ledger row with the type snapshot, price, dates, `granted_by`, notes, and `assessment_id`.
6. Write audit entry `license.assigned` with package, type, price, expiry, and cycle action.
7. Send `sendPackageAssignedEmail` to the client (fire and forget).
8. Return the new row and the new entitlement.

### 6.6 Daily cron

`app/api/cron/reaffirmation/route.ts` gains a second job. The existing 11-month re-affirmation job runs first and is unchanged.

- Select non-voided licenses where `expiry_reminded_at is null` and `expires_at` is after now and within the next 14 days (limit 100).
- Skip rows that are no longer the client's current license (a newer non-voided row exists). Set `expiry_reminded_at` on them so they are not reconsidered.
- For the rest, send `sendLicenseExpiringEmail` to the client and to `ADMIN_NOTIFY_EMAIL`, set `expiry_reminded_at`, and write audit entry `license.expiry_reminded`.
- The JSON response adds `licensesReminded`.

## 7. Admin UI

### 7.1 Packages page

- New page `app/admin/packages/page.tsx` at `/admin/packages`, admin only.
- New sidebar entry in `app/admin/layout.tsx`, between Analytics and Team: `{ id: "packages", href: "/admin/packages", label: "Packages" }` with an icon in the style of the existing entries.
- A table of packages with inline edit of name, price, duration, description, and active flag. Save per row calls `PUT /api/admin/packages`. An Add package button creates a row with `POST /api/admin/packages`.
- Errors, such as the 409, show inline on the row.

### 7.2 Client page Licensing panel

New component `app/admin/clients/[id]/LicensingPanel.tsx`, placed on `app/admin/clients/[id]/page.tsx` above the assessment workflow (above `AssessmentLifecycleBar`).

- Entitlement badge: `No license`, `Active until <date>`, or `Expired on <date>`.
- Purchase history table: date, package, type, price, expires, notes, granted by, voided (date and reason).
- Assign package form: package dropdown filtered by the `planAssignment` rules, price prefilled from the catalog and editable, notes field, and a confirm step. The confirm text states the cycle action, for example "This opens a new assessment cycle."
- Void action per row. The reason is entered in an in-app modal, not `window.confirm`, matching the modals in `ClientAccountActions.tsx`.
- A `readOnly` prop hides the assign form and void actions.

### 7.3 Client lists

`app/admin/clients/page.tsx` and `app/admin/dashboard/page.tsx` gain a License column showing status and expiry, for example "Active, Dec 25, 2026", "Expired, Sep 1, 2026", or "None".

### 7.4 Assessor mirror

`app/assessor/clients/[id]/page.tsx` renders `LicensingPanel` with `readOnly`. This keeps the admin and assessor client pages aligned (known gap 7).

## 8. Client portal

### 8.1 Dashboard License card

On `app/portal/dashboard/page.tsx`: package name, status, expiry date, and one plain-language line.

| State | Line |
|---|---|
| Active single or additional | "Your Single Assessment package lets you submit one assessment by December 25, 2026." (the package name and date are filled in) |
| Active unlimited | "Your Unlimited package lets you run assessments as often as you like until December 25, 2026." |
| Expired | "Your license expired on September 1, 2026." |
| None | "You do not have an active license." |

The card has a Request package button.

### 8.2 Inactive banner

Shown on `app/portal/assessment/page.tsx`, `app/portal/documents/page.tsx`, and `app/portal/scoping/page.tsx` when the entitlement is `none` or `expired`:

- Expired: "Your license has expired. Contact Galaxy to purchase an additional assessment or the unlimited package."
- None: "No active license. Contact Galaxy to purchase an assessment package."
- The banner has a Request package button.
- All edit controls on those pages are disabled. The Reports and Deliverables pages are unchanged and stay downloadable.
- If a write returns `license_inactive` (for example, the license expired while the page was open), the page shows the banner and disables its controls.

### 8.3 Request package form

A small modal with a package choice (active packages, with price and description) and an optional message. It calls `POST /api/licenses/request` and confirms "Your request was sent to Galaxy."

### 8.4 Start new assessment (unlimited)

- When `canStartCycle` is true, the dashboard shows a Start new assessment card. Copy: "Your previous answers carry forward. You only need to update the controls that changed since your last assessment."
- The button calls `POST /api/assessment/start-cycle`, then routes to `/portal/assessment`.
- The assessment page's finalized-state message says Galaxy will start the next cycle. For clients with `canStartCycle`, it instead points to the Start new assessment action.

### 8.5 Previous-cycle reference

`app/portal/assessment/page.tsx` loads its data from `GET /api/assessment?clientId=...`. It reads the new `previousResponses` field. When a control has a previous answer, the control shows a muted reference line such as "Last cycle: Yes". The values `yes`, `partial`, `no`, and `na` display as Yes, Partial, No, and N/A.

### 8.6 Profile Purchases section

`app/portal/profile/page.tsx` adds a Purchases section below `ProfileView`. It lists the client's ledger rows: package, purchase date, expiry, price paid, and a Voided marker where set. It reads through RLS with `createServerSupabaseClient()`.

## 9. Emails (`lib/email.ts`)

All three use the existing `baseTemplate` and are called fire and forget, like the existing senders.

| Function | To | Content |
|---|---|---|
| `sendPackageAssignedEmail` | Client | Package name, expiry date, what it allows, and whether a new cycle was opened |
| `sendLicenseExpiringEmail` | Client and `ADMIN_NOTIFY_EMAIL` | Company, package, expiry date, and how to request a new package |
| `sendPackageRequestEmail` | `ADMIN_NOTIFY_EMAIL` | Company, contact, requested package and price, optional message, and a link to the admin client page |

No new environment variables. `.env.example` is unchanged.

## 10. Documentation

### 10.1 `docs/SRS.md`

New section **10.4 Licensing and Packages** with these requirements:

- **FR-LC-01** The system shall keep an admin-editable package catalog with name, type (single, additional, unlimited), price in USD, duration in months, description, and active flag, with at most one active package per type.
- **FR-LC-02** The system shall record each purchase as an append-only license ledger row with package, type snapshot, price paid, start, expiry, granting admin, and notes.
- **FR-LC-03** A license shall start when assigned and expire after the package duration in calendar months. A new license shall not stack on remaining time.
- **FR-LC-04** A Single Assessment license shall be assignable only to a client with no prior non-voided license. An Additional Assessment license shall require at least one. An Unlimited license shall be assignable at any time.
- **FR-LC-05** Assigning a Single or Additional license shall open a new cycle when the latest cycle is finalized, and reuse the latest cycle when it is unfinished.
- **FR-LC-06** A client's entitlement shall be derived from their latest non-voided license by start date: none, active, or expired.
- **FR-LC-07** Without an active license, a client shall not be able to save answers, upload or delete evidence, change the document library, save scoping, respond to information requests, or submit. The server shall return 403 `license_inactive`.
- **FR-LC-08** Without an active license, a client shall keep login, read access to past answers, and download access to existing reports and deliverables.
- **FR-LC-09** A client with an active Unlimited license shall be able to start a new cycle once the latest cycle is finalized. Previous answers shall carry forward and be shown as a reference.
- **FR-LC-10** An admin shall be able to void a license with a reason. Voided licenses shall be ignored for entitlement.
- **FR-LC-11** The daily cron shall email the client and the admin once, 14 days before a client's current license expires.
- **FR-LC-12** Clients shall see their license status, expiry, and purchase history, and shall be able to request a package, which emails the admin.
- **FR-LC-13** License assignment, voiding, requests, and expiry reminders shall be written to the audit log.

Other SRS changes:

- Section 4.2 capability matrix: add rows for managing packages (admin), assigning and voiding licenses (admin), and viewing licenses (admin, assessor, and the client's own).
- Section 5.3: note that saving answers requires ownership, an editable status, and an active license.
- Section 11.1: add `packages` and `client_licenses`. Section 11.2: add the `packages.type` values. Section 11.3: update the migration count to 23.
- Section 13: add the row "Online payment | Purchases are paid offline and recorded by an administrator. No card data is handled."
- Section 16: add a change log row for version 1.1.
- Regenerate the Word export with `npm run docs:srs-docx` in the same commit.

### 10.2 `docs/SRS-known-gaps.md`

Record that `POST /api/assessment` had no ownership or status check and wrote through the service client, and that this work fixes it. Update gap 3 (write paths not covered by automated tests) to note the new route tests.

## 11. Testing

The test runner is Vitest (`npm test` runs `vitest run`). Tests live in `tests/`.

### 11.1 Unit tests (`tests/licensing.test.ts`)

- `computeEntitlement`: no rows gives `none`; an active row; an expired row; `expires_at` equal to now is expired; voided rows are ignored, including when every row is voided; the latest by `starts_at` wins over an older row with a later expiry; `canStartCycle` is true only for active unlimited with a finalized latest cycle.
- `planAssignment`: single rejected with a prior license; single allowed when all prior rows are voided; additional rejected with no prior license; additional allowed with one; each cycle action (open, reuse, none) for finalized, unfinished, and missing cycles; unlimited never opens a cycle.
- `addMonths`: the plain case and the month-end clamp.

### 11.2 Route tests (`tests/license-gates.test.ts`)

Call the route handlers directly with `@/lib/supabase-server` mocked through `vi.mock`. For `POST /api/assessment`, `POST /api/assessment/submit`, `POST /api/artifacts`, `POST /api/scoping`, and `POST /api/assessment/start-cycle`, cover:

- The owning client with an active license: allowed.
- The owning client with an expired license: 403 `license_inactive`.
- Another client: 403 `Forbidden`.
- An admin: allowed without a license on `POST /api/scoping`; 403 `Forbidden` as a non-owner on the client-only routes (answer save, submit, artifact upload, start-cycle).

### 11.3 Smoke and build

- `scripts/smoke-test.mjs` discovers routes from the `app/` tree, so it renders `/admin/packages` as admin automatically. Add `/admin/packages` to the list of admin routes that must turn an assessor away.
- `npm test`, `npm run build`, and `npm run smoke` must pass.

## 12. Out of scope

- Online payment
- Invoice or receipt PDF generation
- Proration
- Refunds
- Multiple licenses active at once
- Per-user seats

## 13. Implementation order

1. Migration `023_licensing.sql`, `lib/licensing.ts`, extraction of `lib/reassessment.ts` with the reassess route refactored onto it, and unit tests.
2. Enforcement on client write routes, including the answer-save ownership and status fix, and route tests.
3. Admin API routes, the Packages page, the Licensing panel, and the License column on client lists.
4. Portal UI: License card, banners, request form, Profile purchases, previous-cycle reference, and the start-cycle route and button.
5. Cron expiry job and the three emails.
6. SRS updates, Word export regeneration, known-gaps update, and the smoke test update.
