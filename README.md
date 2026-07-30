# Galaxy CMMC Portal

Full-stack CMMC 2.0 compliance assessment platform for Galaxy Consulting, LLC.

**Live:** https://galaxy-cmmc-portal.vercel.app

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
```

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

See `docs/upgrade-2026-07.md` for full deploy checklist.

## Tests

```bash
npm test
```

Covers: SPRS scoring rules, catalog integrity (110 requirements, 17 Level 1 practices, 320 assessment objectives), upload validation.

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
- Control "met" only if all 800-171A objectives satisfied
- SPRS math computed locally (`lib/scoring.ts`), never by the LLM
- SPRS range: 110 − deductions, floor −203; partial credit for 3.5.3 and 3.13.11
- **POA&M eligibility** follows 32 CFR 170.21(a)(2): a Conditional Level 2 needs score ≥ 88 (80%) and every open gap POA&M-eligible. Only 1-point items may ride on a POA&M (plus 3.13.11 at a 3-point deduction), **except the six requirements that can never be deferred** — 3.1.20, 3.1.22, 3.10.3, 3.10.4, 3.10.5, 3.12.4 (`POAM_INELIGIBLE_CONTROLS` in `lib/scoring.ts`)

## Roles

| Role | Access |
|------|--------|
| `admin` | Galaxy staff — full admin panel, AI review, client & team management |
| `assessor` | Galaxy assessors — assigned clients: review, determinations, artifact generation |
| `client` | Defense contractors — submit assessments, answer intake, view deliverables |

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

## Assessment Lifecycle

`in_progress` → `submitted` → `under_review` → `remediation_required` → `resubmitted` → `approved` → `finalized` → `archived`
