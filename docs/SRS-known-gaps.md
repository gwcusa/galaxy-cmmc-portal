# Known Gaps and Open Decisions — Galaxy CMMC Portal

| | |
|---|---|
| **Classification** | **INTERNAL — Galaxy engineering only** |
| **Version** | 1.0 |
| **Date** | September 3, 2026 |
| **Companion to** | [SRS.md](SRS.md) v1.0 |

> **Do not distribute.** This document is deliberately candid about weaknesses
> in the shipped system so they are tracked rather than rediscovered. It is not
> suitable for clients, prospects, or a C3PAO. The distributable specification
> is `SRS.md`, which carries no gap analysis.

---

## How to use this document

Each item states the gap, why it matters, what currently compensates for it,
and what closing it would take. Severity is engineering judgement about risk to
correctness or confidentiality, not a delivery commitment.

Items are retired by fixing them and moving the requirement into `SRS.md`, not
by deleting them here.

---

## 1. RLS policies do not recognize the `assessor` role

**Severity:** Medium

**Gap.** The Row Level Security policies in `supabase/migrations/001_initial.sql`
grant access to the record owner (`user_id = auth.uid()`) or to `admin`. The
`assessor` role appears in no policy. Assessors can see client data only because
every staff route runs through a service-role client that bypasses RLS.

**Why it matters.** RLS provides no defense-in-depth for assessor access. Any
code path that reaches the database *without* the service-role client — most
plausibly a browser-side query added to a staff page using the anon key — will
return an empty result set for an assessor and appear to be a data bug. This is
precisely the failure mode that took assessors offline in September 2026.

**Currently compensating.** Authorization is enforced in application code
(`requireAdminOrAssessor()`, `isStaff` checks) and no staff page queries
Supabase from the browser. `SRS.md` §4.3 states this as a normative constraint.

**To close.** Add assessor clauses to the `clients`, `assessments`,
`assessment_responses` and `reports` policies mirroring the existing admin
clauses. This widens database-level privilege, so it should be a deliberate
decision rather than a drive-by change.

---

## 2. No multi-factor authentication

**Severity:** Medium

**Gap.** Authentication is email plus password only. Supabase Auth supports MFA;
it is not enabled.

**Why it matters.** Staff accounts can read every client's assessment posture,
gap list and evidence — a map of exactly where each defense contractor is weak.
That is a high-value target for credential theft, and the platform sells
security consulting.

**Currently compensating.** Nothing beyond password strength (8 character
minimum) and administrator-provisioned accounts (no self-registration).

**To close.** Enable Supabase MFA enrollment, require it for `admin` and
`assessor`, and add an enrollment step to the invite flow. Optional for clients.

---

## 3. Assessment write paths are not covered by automated tests

**Severity:** Medium

**Gap.** `npm run smoke` issues GET requests only. Recording a determination,
submitting an assessment, transitioning lifecycle state, approving remediation
guidance and generating artifacts are exercised manually or not at all.

**Why it matters.** The read paths are now well protected; the write paths carry
more logic (scoring, state machines, artifact generation) and no regression net.

**Currently compensating.** Unit tests cover scoring and catalog integrity —
the pure logic. The rest is manual verification.

**To close.** Extend the smoke test with a write pass against the throwaway
client it already creates: submit an assessment, record a determination, verify
the score reflects the override, then roll back. The fixture and cleanup
machinery already exist.

---

## 4. The smoke test writes to the production database

**Severity:** Low

**Gap.** There is one Supabase project. `npm run smoke` creates one throwaway
user per role plus a temporary client record in production, whichever `baseUrl`
it targets.

**Why it matters.** A hard-killed run can leave orphan accounts and a stray
client row visible in the admin client list.

**Currently compensating.** Cleanup runs in a `finally` block and on SIGINT.
Test records use identifiable markers (`smoke-test-` email prefix, company name
`ZZ Smoke Test (delete me)`), and `npm run smoke:cleanup` removes leftovers.
Post-run verification: `user_roles` should return to 8 rows, `clients` to 11.

**To close.** Provision a staging Supabase project and point non-production
runs at it.

---

## 5. No uptime or error monitoring

**Severity:** Low

**Gap.** No Sentry, no error aggregation, no uptime checks. A server exception
surfaces only when a user reports it.

**Why it matters.** In September 2026 every assessor hit a 500 on login and the
first signal was the client telling us. The digest in the browser error page was
not traceable to a stack trace without reproducing locally.

**Currently compensating.** `npm run smoke` against production after any deploy
touching auth, authorization or routing (`SRS.md` §15, OPS-04).

**To close.** Add Sentry (or Vercel's built-in observability) with alerting on
5xx, plus a scheduled smoke run.

---

## 6. CUI/FCI restriction is policy-enforced only

**Severity:** Low

**Gap.** The portal displays a persistent "do not upload CUI or FCI" warning.
Nothing scans, classifies or blocks an upload that contains it.

**Why it matters.** A client who ignores the notice puts Galaxy in possession of
CUI in a system not assessed to hold it.

**Currently compensating.** The notice is on every client portal page; evidence
is hashed and audit-logged, so provenance is traceable after the fact.

**To close.** Either accept the procedural control explicitly (documented risk
acceptance), or add content inspection on upload. The latter is significant
scope.

---

## 7. Admin and assessor client pages can drift

**Severity:** Low

**Gap.** `app/admin/clients/[id]/page.tsx` and
`app/assessor/clients/[id]/page.tsx` are separate files importing a common set
of panel components. Capability parity depends on both files being edited
together.

**Why it matters.** They have already drifted. The assessor page fetched the
client's uploaded evidence and generated signed URLs for it, then never rendered
the section — assessors could not see the files they were assessing. Fixed
September 2026 by extracting `components/EvidenceArtifactsSection.tsx`.

**Currently compensating.** The smoke test renders both pages, but only checks
that they return HTTP 200 — it cannot detect a missing section.

**To close.** Continue extracting shared markup into components. A stronger fix
is a single client-detail component parameterized by role, with the admin-only
account-management panels passed in.

---

## Open decisions

| Decision | Status |
|---|---|
| Should assessors get client-info editing, assessor assignment, client account actions, or password resets? | **Closed — no.** Confirmed September 2026: assessors keep assessment authority only; account administration stays with admins. Recorded as SEC-05 in `SRS.md`. |
| Add assessor clauses to the RLS policies? | Open — see item 1. |
| Require MFA for staff? | Open — see item 2. |
| Provision a staging Supabase project? | Open — see item 4. |

---

## Change log

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-09-03 | Split out of `SRS.md` §14 so the specification can be shared externally. Each item expanded with impact, compensating controls and closure path. |
