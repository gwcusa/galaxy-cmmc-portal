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

Copy `.env.local.example` to `.env.local` and fill in:

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

`CMMC-Test-Files/` contains 1,101 synthetic evidence files for testing and demos:

- **5 fictional defense contractor companies**
- **110 NIST SP 800-171 Rev 2 controls** (all 14 domains: AC, AT, AU, CM, IA, IR, MA, MP, PE, PS, RA, CA, SC, SI)
- **2 files per control per company:** a POLICY document and an Implementation Evidence PROOF document
- Total: 110 controls × 5 companies × 2 files = 1,100 content files + 1 index = **1,101 files**

Test companies:
| Slug | Company | IT Contact |
|------|---------|------------|
| ASJ-Realty | ASJ Realty | Sandra Okonkwo |
| Bumpass-Fire | Bumpass Fire & Rescue | Mike Sadler |
| Keith-Drone-Guy | Keith the Drone Guy LLC | Keith Merritt |
| Money-Straight-Talk | Money Straight Talk LLC | Terrell Banks |
| Blue-Ridge-Tech | Blue Ridge Technology Solutions LLC | Nathan Cruz |

File naming: `[control-id]-[Company-Slug]-POLICY-[Title].txt` / `[control-id]-[Company-Slug]-PROOF-[Title].txt`

## Architecture Notes

- Clients **never** see scores, AI verdicts, synthesis, or analytics — assessor-only
- Control "met" only if all 800-171A objectives satisfied
- SPRS math computed locally (`lib/scoring.ts`), never by the LLM
- SPRS range: 110 − deductions, floor −203; partial credit for 3.5.3 and 3.13.11

## Roles

| Role | Access |
|------|--------|
| `admin` | Galaxy assessors — full admin panel, AI review, client management |
| `client` | Defense contractors — submit assessments, view deliverables |

## Product Tiers (`clients.engagement_type`)

- `assessment`: Submit → AI review → Assessor review → Report
- `remediation`: Above + intake questions, artifact generation, publish deliverables

## Assessment Lifecycle

`in_progress` → `submitted` → `under_review` → `remediation_required` → `resubmitted` → `approved` → `finalized` → `archived`
