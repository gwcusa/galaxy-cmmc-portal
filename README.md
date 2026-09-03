# Galaxy CMMC Portal

Full-stack CMMC 2.0 compliance assessment platform for Galaxy Consulting, LLC.

**Live:** https://galaxy-cmmc-portal.vercel.app

## Documentation

- **[docs/SRS.md](docs/SRS.md)** — System Requirements Specification (v1.0). The
  formal spec: roles and the capability matrix, regulatory rules implemented,
  functional requirements per role, data model, excluded scope, and known gaps.
  Written against the shipped system — where it and the code disagree, the code
  is authoritative and the SRS is a defect.
- [docs/upgrade-2026-07.md](docs/upgrade-2026-07.md) — deploy checklist for the
  July 2026 upgrade.

This README covers day-to-day development: setup, migrations, tests, and the
architecture notes you need before touching auth or data access.

## Tech Stack

- **Frontend/Backend:** Next.js 14 App Router (TypeScript)
- **Database + Auth:** Supabase (Postgres + RLS + Storage)
- **AI:** Anthropic Claude Sonnet 4.6 via `@anthropic-ai/sdk` (tool-use, structured outputs, prompt caching)
- **Email:** Resend (wired; requires env vars)
- **PDF:** `@react-pdf/renderer` | **DOCX:** `docx` | **Doc parsing:** mammoth + xlsx
- **Tests:** vitest (`npm test`) — scoring, catalog integrity, uploads
- **Hosting:** Vercel

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
ADMIN_NOTIFY_EMAIL=
EMAIL_FROM=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

`CRON_SECRET` protects the daily re-affirmation reminder endpoint (`/api/cron/reaffirmation`), invoked by the Vercel Cron defined in `vercel.json`.

## Database Migrations

Apply in order via Supabase SQL Editor. **Take a backup before running 009.**

| Migration | Description |
|-----------|-------------|
| `001_initial.sql` | Initial schema |
| `002`–`007` | Incremental feature additions |
| `008_security_fixes.sql` | Recursive RLS fix on user_roles |
| `009_cmmc2_control_ids.sql` | NIST SP 800-171 Rev 2 control IDs; remaps live data |
| `010_document_library.sql` | Documents + control links + scoping |
| `011_engine_v2.sql` | Objective results, tracked AI runs, summaries |
| `012_remediation_studio.sql` | Intake questions, artifact versioning + publish |
| `013_audit_ops.sql` | Audit log, assessor assignment |
| `014_evidence_types.sql` | Evidence/artifact type refinements |
| `015_reports_unique_assessment.sql` | Unique constraint on `reports.assessment_id` (idempotent) |
| `016_assessor_role.sql` | Dedicated `assessor` role (separate from `admin`) |
| `017_remediation_automation.sql` | Consolidated intake (`ai_intake_package`), `responsibility_matrix` artifact type, `generated_artifacts.covers_controls`, document provenance (`documents.source` / `source_artifact_id`) |
| `018_reaffirmation.sql` | `assessments.reaffirmation_reminded_at` for the annual re-affirmation reminder cron |
| `019_objective_determinations.sql` | `assessor_determinations.objective_verdicts` for per-objective (NIST 800-171A) assessor verdicts |
| `020_evidence_integrity.sql` | `sha256` on `artifacts` and `documents` for tamper-evident evidence |

See `docs/upgrade-2026-07.md` for full deploy checklist.

## Tests

```bash
npm test
```

Covers: SPRS scoring rules, catalog integrity (110 requirements, 17 Level 1 practices, 320 assessment objectives), upload validation.

### Route smoke test

```bash
npm run build && npm start          # in one shell
npm run smoke                       # http://localhost:3000 by default
npm run smoke https://galaxy-cmmc-portal.vercel.app
npm run smoke:cleanup               # only if a run was killed mid-flight
```

Signs in as an admin, an assessor and a client, then requests **every**
app-router page as the role that owns it, plus: the portal pages with no client
record (empty-state branches), each role reaching another role's area, and
signed-out access. Routes are discovered from `app/**/page.tsx`, so a new page
is covered without editing the script.

This catches what `npm test` and `next build` structurally cannot. A server
component that renders something React rejects — an `onMouseEnter` on a DOM
node, for instance — compiles cleanly and only throws at request time, and only
when that branch actually renders. That exact bug shipped once: the assessor
dashboard's row markup was unreachable while assessors saw zero clients, and
surfaced as a 500 the moment they could see any.

Note: there is one Supabase project, so the smoke test writes to the real
database whichever `baseUrl` you point it at. It creates one throwaway user per
role plus a temporary client record (`ZZ Smoke Test (delete me)`) and removes
them in a `finally` block.

## Regenerating the Control Catalog

```bash
node scripts/build-catalog.mjs <dir containing sp800-171r2-reqs.xlsx and sp800-171a-procedures.xlsx>
```

## CMMC Test Files

`CMMC-Test-Files/` contains synthetic evidence files for testing and demos, organized into one folder per fictional company:

- **5 fictional defense contractor companies** (one subfolder each)
- **110 NIST SP 800-171 Rev 2 controls** (all 14 domains: AC, AT, AU, CM, IA, IR, MA, MP, PE, PS, RA, CA, SC, SI)
- Per control per company: a POLICY document and an Implementation Evidence PROOF document, each in both **`.txt` and `.pdf`** — 440 files per company
- Total: **2,200 evidence files + `00-INDEX.txt`**

Test companies (folders): `ASJ Realty`, `Bumpass Fire`, `Keith Drone Guy`, `Money Straight Talk`, `Blue Ridge Tech`.

File naming: `[control-id]-[Company-Slug]-POLICY-[Title].{txt,pdf}` / `[control-id]-[Company-Slug]-PROOF-[Title].{txt,pdf}`

## Architecture Notes

- Clients **never** see scores, AI verdicts, synthesis, or analytics — assessor-only
- Control "met" only if all 800-171A objectives satisfied — the AI evaluates every objective, and assessors can now record a verdict **per objective** (rolled up to the control) in the review panel
- Assessment-objective data (`data/assessment-objectives.json`) carries the full NIST SP 800-171A **Examine / Interview / Test** methods per requirement; the AI review notes when an objective needs a live interview/test to confirm
- **Server-side Supabase clients** (`lib/supabase-server.ts`) — `createServerSupabaseClient()` is cookie-backed and is the only thing that may read auth (`auth.getUser()`). `createServiceSupabaseClient()` must **never** be given cookies: supabase-js prefers a session's access token over the API key, so a cookie-backed "service" client silently runs as the logged-in user with RLS enforced. That bug hid every client from assessors while admins worked fine, because the RLS policies whitelist `role = 'admin'` and never mention `assessor`.
- **RLS is not the authorization model.** The policies in `001_initial.sql` only know `admin` and the record owner. Assessor access is granted in application code (`requireAdminOrAssessor()` in `lib/auth-helpers.ts`, `isStaff` checks in the route handlers) on top of a service-role client that bypasses RLS. A new staff-facing route must gate itself — do not rely on RLS to scope it, and do not add a browser-side query to a staff page, which would come back empty.
- SPRS math computed locally (`lib/scoring.ts`), never by the LLM
- SPRS range: 110 − deductions, floor −203; partial credit for 3.5.3 and 3.13.11
- **POA&M eligibility** follows 32 CFR 170.21(a)(2): a Conditional Level 2 needs score ≥ 88 (80%) and every open gap POA&M-eligible. Only 1-point items may ride on a POA&M (plus 3.13.11 at a 3-point deduction), **except the six requirements that can never be deferred** — 3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5, 3.12.4 (`POAM_INELIGIBLE_CONTROLS` in `lib/scoring.ts`)

## Roles

Roles live in the `user_roles` table. That table is **authoritative** —
`auth.users.user_metadata.role` is a copy that can drift, so gates and redirects
must read `user_roles` (see `lib/roles.ts`).

| Role | Access |
|------|--------|
| `admin` | Galaxy staff — everything below, plus account administration: create/edit/disable/delete client accounts, reset client passwords, invite assessors, assign an assessor to an assessment |
| `assessor` | Galaxy assessors — **every** client, not just assigned ones: full assessment work at `/assessor/*` — control review, per-objective determinations, lifecycle transitions, AI review, gap remediation, information requests, gap intake, artifact generation, evidence viewing, SPRS worksheet and assessment CSV export |
| `client` | Defense contractors — submit assessments, answer intake, view deliverables |

Assessors have parity with admins on **client work**; the `/admin/*` area stays
admin-only because it is account administration. `/admin/clients/[id]` and
`/assessor/clients/[id]` are separate files that import the same panel
components, so they *can* drift — and have: the assessor page fetched the
client's evidence and then never rendered it. When you add a capability to one,
add it to the other, and prefer extracting shared markup into a component (as
`EvidenceArtifactsSection` now is) over copying it.

Every role changes its own password at `/portal/profile`, `/admin/profile` or
`/assessor/profile` via `POST /api/account/password`. The route verifies the
current password on a throwaway client, then updates through the caller's own
session — **not** `auth.admin.updateUserById()`, which revokes every session
including the caller's and would dump them at the login screen. The user stays
signed in here; their other devices are signed out. Logged to `audit_log`.

## Product Tiers (`clients.engagement_type`)

- `assessment`: Submit → AI review → Assessor review → Report
- `remediation`: Above + intake questions, artifact generation, publish deliverables

## Remediation Automation

For `remediation`-tier clients, the assessor can produce the full document package with minimal clicks:

- **Consolidated intake** (`POST /api/admin/remediation/intake-package/generate`) — one de-duplicated questionnaire covering **every** gap at once; each question is tagged with the controls it informs, so an answer asked once (e.g. "which MFA tool?") feeds every control it touches.
- **One-click full package** (`POST /api/admin/remediation/package/generate`) — drafts the **SSP, POA&M, Policy & Procedure templates, and Customer Responsibility Matrix** in a single run. Per-control **configuration baselines** stay on-demand.
- **Customer Responsibility Matrix** — maps every control to the responsible party (Client / MSP-ESP / Cloud Provider / Shared), grounded in the scoping profile.
- **Close-the-loop** — publishing a Policy bundle or SSP materializes it as a mapped evidence document (`documents` + confirmed `document_control_links`) so the next assessment automatically sees it. Idempotent via `documents.source_artifact_id`.
- Generators live in `lib/remediation-artifacts.ts` (shared by the single-artifact and package routes).

## Reporting & Compliance Lifecycle

- **SPRS submission worksheet** — `GET /api/admin/reports/sprs-worksheet?assessmentId=…` downloads a submission-ready worksheet (score, itemized deductions, POA&M eligibility, senior-official affirmation block). Built by `lib/sprs-worksheet.ts`; linked from both the admin and assessor client pages. (Assessor-only — clients never see scores.)
- **Full assessment CSV** — `GET /api/admin/reports/assessment-csv?assessmentId=…` exports every in-scope control with the client response, AI verdict, assessor verdict, per-objective roll-up, and notes.
- **Evidence integrity** — every uploaded artifact/document is SHA-256 hashed at upload (`artifacts.sha256`, `documents.sha256`), recorded in the audit log, so a policy/proof file is tamper-evident.
- **Branded PDF** — the report cover and every content-page running header carry the Galaxy orbit mark (vector, via react-pdf primitives).
- **Annual re-affirmation reminders** — a daily Vercel Cron (`vercel.json` → `/api/cron/reaffirmation`) emails clients ~11 months after finalization, once per cycle (tracked by `assessments.reaffirmation_reminded_at`).
- **Scoping asset inventory** — the scoping profile captures the in-scope asset inventory and external service providers, feeding the SSP system boundary and the Customer Responsibility Matrix.
- **N/A justification** — selecting N/A on a control prompts the client for the applicability justification an assessor must validate.
- **Branding** — Galaxy Consulting logo in the portal (sidebar + login) and on the PDF report cover (vector mark).

## Assessment Lifecycle

`in_progress` → `submitted` → `under_review` → `remediation_required` → `resubmitted` → `approved` → `finalized` → `archived`
