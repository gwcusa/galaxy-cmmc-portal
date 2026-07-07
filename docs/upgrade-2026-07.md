# Upgrade Notes — July 2026 Overhaul

Five-phase upgrade: CMMC 2.0 catalog + SPRS scoring, evidence pipeline, assessment
engine v2, remediation studio, and ops hardening.

## Deploy checklist (in order)

1. **Rotate the Supabase service-role key.** The old key was hardcoded in
   `scripts/seed.mjs` and is in git history. Rotate it in Supabase → Settings → API,
   then update `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and Vercel.

2. **Apply migrations 008–013** (Supabase SQL editor or CLI), in order:
   - `008_security_fixes.sql` — fixes the recursive `user_roles` RLS policy
   - `009_cmmc2_control_ids.sql` — replaces the legacy control catalog with NIST
     SP 800-171 Rev 2 IDs and remaps all existing client data. **Take a backup
     first** (Supabase → Database → Backups). 11 legacy controls had no exact
     Rev 2 counterpart and were mapped to the nearest same-family requirement
     (see `scripts/build-catalog.mjs` MANUAL_MAP); affected client responses
     should be re-verified on resubmission.
   - `010_document_library.sql` — documents + control links + scoping
   - `011_engine_v2.sql` — objective results, tracked AI runs, summaries
   - `012_remediation_studio.sql` — intake questions, artifact versions/publish
   - `013_audit_ops.sql` — audit log, assessor assignment

3. **Env vars** (Vercel + `.env.local`): `RESEND_API_KEY`, `ADMIN_NOTIFY_EMAIL`,
   `EMAIL_FROM` to activate the four email triggers (code is already wired).

4. **Storage**: the `documents` bucket is created automatically on first upload
   (private). No action needed.

5. **Vercel duration**: submit/run-ai/generate routes set `maxDuration = 300`.
   On plans capped lower, Vercel clamps it — full 110-control runs need the
   higher cap (Pro with fluid compute).

## Regenerating the control catalog

`data/nist-800-171-controls.json` and `data/assessment-objectives.json` are
generated from the official NIST spreadsheets:

```
node scripts/build-catalog.mjs <dir containing sp800-171r2-reqs.xlsx and sp800-171a-procedures.xlsx>
```

Sources: NIST CSRC — SP 800-171 Rev 2 security requirements xlsx and SP 800-171A
assessment procedures xlsx. Weights are the DoD Assessment Methodology v1.2.1
Annex A values (embedded in the script, verified: 44×5 + 14×3 + 51×1 = 313,
floor −203).

## Tests

`npm test` — SPRS scoring rules, catalog integrity (110 requirements, 17
Level 1 practices, 320 assessment objectives), upload validation.
