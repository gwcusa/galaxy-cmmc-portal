# System Requirements Specification (SRS)

**Galaxy CMMC 2.0 Compliance Portal**

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | September 3, 2026 |
| **Prepared for** | Galaxy Consulting LLC (SDVOSB) |
| **System** | CMMC 2.0 assessment, remediation and reporting platform |
| **Production URL** | `galaxy-cmmc-portal.vercel.app` |
| **Repository** | `github.com/gwcusa/galaxy-cmmc-portal` |
| **Status** | Live and in operational use |

> **How to read this document.** This SRS is written *against the shipped
> system* — it describes what the code does as of the date above, not an
> aspirational design. Requirements are stated with "shall" and carry stable
> IDs. Section 13 states what is deliberately excluded from scope.

---

## Table of Contents

1. Executive Summary
2. Regulatory Context
3. Technology Architecture
4. Security and Access Control
5. Client Portal Requirements
6. Assessor Workspace Requirements
7. Administrator Console Requirements
8. AI Review Engine Requirements
9. Remediation Automation Requirements
10. Reporting and Compliance Lifecycle
11. Data Model
12. Non-Functional Requirements
13. Excluded Scope
14. Verification and Testing
15. Deployment and Operations
16. Change Log

---

## 1. Executive Summary

### 1.1 Purpose

Galaxy Consulting delivers CMMC 2.0 readiness services to defense contractors.
This platform replaces the spreadsheet-and-email workflow those engagements
would otherwise require, covering the full engagement lifecycle:

- A defense contractor (the **client**) self-reports against the 110 NIST
  SP 800-171 Rev 2 security requirements and uploads supporting evidence.
- An AI review pass evaluates every response against the NIST SP 800-171A
  assessment objectives and flags what is insufficient.
- A Galaxy **assessor** reviews the AI findings, records a determination per
  control and per objective, and drives the assessment through its lifecycle.
- The system computes the SPRS score locally, determines POA&M eligibility per
  32 CFR 170.21, and produces submission-ready deliverables.
- For remediation-tier engagements, the system drafts the SSP, POA&M, policy
  templates and Customer Responsibility Matrix from the assessment data.

### 1.2 Design Principles

| Principle | Consequence |
|---|---|
| Scores are never shown to clients | SPRS scores, AI verdicts, synthesis and analytics are staff-only |
| The LLM never computes the score | All SPRS math is deterministic TypeScript (`lib/scoring.ts`) |
| Evidence must be tamper-evident | Every upload is SHA-256 hashed and recorded in the audit log |
| A control is "met" only if every objective is met | Assessment is objective-level, not control-level |
| Assessors are not junior admins | Assessors have full authority over assessment work and none over account administration |

### 1.3 Current Scale

| Metric | Count |
|---|---|
| NIST SP 800-171 Rev 2 requirements | 110 |
| NIST SP 800-171A assessment objectives | 320 |
| FAR 52.204-21 Level 1 practices | 17 |
| Database tables | 18 |
| Database migrations | 20 |
| API endpoints | 37 |
| Application pages | 21 |
| Storage buckets | 3 (`reports`, `artifacts`, `documents`) |

---

## 2. Regulatory Context

### 2.1 Standards Implemented

| Authority | Application in this system |
|---|---|
| **NIST SP 800-171 Rev 2** | The 110 security requirements across 14 domains form the assessment catalog |
| **NIST SP 800-171A** | The 320 assessment objectives, plus the Examine / Interview / Test methods per requirement |
| **32 CFR 170.21(a)(2)** | POA&M eligibility rules for CMMC Level 2 Conditional status |
| **FAR 52.204-21** | The 17 practices constituting CMMC Level 1 |
| **DoD SPRS scoring methodology** | 110 minus weighted deductions, floor −203, with defined partial credit |

**REG-01** — The system **shall** compute SPRS scores using the DoD methodology
implemented in `lib/scoring.ts`, and **shall not** delegate score computation to
a language model.

**REG-02** — The system **shall** treat a requirement as met only when every one
of its SP 800-171A objectives is satisfied.

**REG-03** — The system **shall** apply the SPRS weighting of 1, 3 or 5 points
per requirement, totalling 313 points of possible deduction, with 3.12.4 as the
sole zero-weight requirement (the SSP special rule).

**REG-04** — The system **shall** award partial credit only for requirements
3.5.3 and 3.13.11, per the DoD methodology.

**REG-05** — The system **shall** determine POA&M eligibility as: score ≥ 88
(80% of 110) **and** every open gap independently POA&M-eligible. Only 1-point
requirements may ride on a POA&M, plus 3.13.11 at a 3-point deduction.

**REG-06** — The system **shall** treat the following six requirements as never
deferrable to a POA&M, regardless of point value
(`POAM_INELIGIBLE_CONTROLS` in `lib/scoring.ts`):

`3.1.20`, `3.1.22`, `3.10.3`, `3.10.4`, `3.10.5`, `3.12.4`

### 2.2 Data Handling Constraint

**REG-07** — The portal **shall** display a persistent warning that it is not
authorized for CUI or FCI, and is for compliance evidence only (policies,
procedures, configuration screenshots, logs). This notice is rendered on every
client portal page.

> **Note.** This is a *procedural* control, not a technical one. The system does
> not scan, classify or block uploads that contain CUI. If Galaxy needs to
> enforce this technically, it is new scope.

---

## 3. Technology Architecture

### 3.1 Platform

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.35 (App Router, React Server Components) |
| Language | TypeScript, React 18 |
| Database | Supabase (PostgreSQL) with Row Level Security enabled |
| Authentication | Supabase Auth (email + password, cookie sessions via `@supabase/ssr`) |
| File storage | Supabase Storage — private buckets, time-limited signed URLs |
| AI | Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Transactional email | Resend |
| Hosting | Vercel, with Vercel Cron for scheduled jobs |
| Document generation | `@react-pdf/renderer` (PDF), `docx` (Word), `xlsx` (spreadsheets), `mammoth` (Word parsing) |

**ARCH-01** — The application **shall** be deployed on Vercel, built from the
`master` branch of the repository.

**ARCH-02** — All secrets **shall** be supplied as environment variables and
**shall not** be committed. `.env.example` **shall** be kept in sync, keys only.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/anon client key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged key (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | Absolute URL for links in outbound email |
| `ANTHROPIC_API_KEY` | Claude API access |
| `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL` | Transactional email |
| `CRON_SECRET` | Shared secret protecting the scheduled cron endpoint |

### 3.2 Supabase Client Discipline

This subsection is normative. These rules govern how staff data access is
obtained, and a violation fails silently rather than loudly.

**ARCH-03** — `createServerSupabaseClient()` (cookie-backed, anon key) **shall**
be the only client used to read the authenticated user (`auth.getUser()`).

**ARCH-04** — `createServiceSupabaseClient()` (service-role key) **shall never**
be constructed with request cookies. `supabase-js` prefers a session's access
token over the API key when a session is present, so a cookie-backed "service"
client silently executes as the logged-in user with RLS enforced — appearing to
work for admins (who are whitelisted in the RLS policies) while returning empty
result sets for every other staff role.

**ARCH-05** — Server components and route handlers **shall not** pass event
handlers (`onClick`, `onMouseEnter`, …) to DOM elements. Such code compiles
cleanly and throws only at request time, and only when that branch actually
renders. Interactive markup **shall** live in a `"use client"` component, or the
behaviour **shall** be expressed in CSS.

---

## 4. Security and Access Control

### 4.1 Roles

**SEC-01** — The system **shall** define exactly three roles in the `user_roles`
table: `admin`, `assessor`, `client`.

**SEC-02** — The `user_roles` table **shall** be the authoritative source of a
user's role. `auth.users.user_metadata.role` is a convenience copy that may
drift and **shall not** be used for authorization or routing decisions.

**SEC-03** — Role management **shall** be service-role only. The `user_roles`
table has a read-own SELECT policy and deliberately no INSERT/UPDATE/DELETE
policies.

### 4.2 Role Capability Matrix

| Capability | admin | assessor | client |
|---|:---:|:---:|:---:|
| View all clients | ✅ | ✅ | — |
| View own record only | — | — | ✅ |
| Complete a gap assessment | — | — | ✅ |
| Upload evidence | — | — | ✅ |
| Respond to information requests | — | — | ✅ |
| View own deliverables and reports | — | — | ✅ |
| View client-uploaded evidence | ✅ | ✅ | own only |
| Run AI review | ✅ | ✅ | — |
| Record control / objective determinations | ✅ | ✅ | — |
| Drive assessment lifecycle transitions | ✅ | ✅ | — |
| Write and approve remediation guidance | ✅ | ✅ | — |
| Raise information requests | ✅ | ✅ | — |
| Generate gap intake questions | ✅ | ✅ | — |
| Generate compliance artifacts | ✅ | ✅ | — |
| Download SPRS worksheet / assessment CSV | ✅ | ✅ | — |
| View SPRS scores, AI verdicts, analytics | ✅ | ✅ | — |
| Change own password | ✅ | ✅ | ✅ |
| **Create / edit / disable / delete client accounts** | ✅ | — | — |
| **Reset a client's password** | ✅ | — | — |
| **Invite assessor accounts** | ✅ | — | — |
| **Assign an assessor to an assessment** | ✅ | — | — |
| **Access the `/admin/*` area** | ✅ | — | — |

**SEC-04** — Assessors **shall** have parity with administrators on *assessment
work* for **every** client, not only assigned ones.

**SEC-05** — Assessors **shall not** have account-administration authority. The
final four rows above are administrator-only by design: they are destructive or
governance actions, not assessment work. *(Confirmed as intended, September
2026.)*

**SEC-06** — Each role **shall** be routed to its own area on sign-in and after
setting a password: `admin` → `/admin/dashboard`, `assessor` →
`/assessor/dashboard`, `client` → `/portal/dashboard`
(`landingPathForRole()` in `lib/roles.ts`).

**SEC-07** — A user reaching an area outside their role **shall** be redirected
to their own landing page. Redirect targets **shall** be derived from the same
authoritative role lookup in every layout, so that two layouts cannot disagree
and bounce a user between them indefinitely.

### 4.3 Authorization Model

**SEC-08** — Authorization **shall** be enforced in application code — via
`requireAdmin()` / `requireAdminOrAssessor()` in `lib/auth-helpers.ts`, or an
equivalent explicit role check in the route handler — layered over a
service-role database client.

**SEC-09** — Row Level Security **shall not** be relied upon as the
authorization model for staff access. The policies in `001_initial.sql`
recognize only `admin` and the owning user; the `assessor` role appears in no
policy. Consequently:

- a new staff-facing route **shall** gate itself explicitly;
- a staff-facing page **shall not** query Supabase from the browser with the
  anon key, as such a query would return an empty set for assessors.

**SEC-10** — Client-facing routes **shall** verify record ownership explicitly
(`clients.user_id === user.id`) rather than depending on RLS to scope results.

### 4.4 Authentication and Credentials

**SEC-11** — Accounts **shall** be created by an administrator; there **shall
not** be public self-registration. New users receive an invite email and set
their own password at `/update-password`.

**SEC-12** — Every role **shall** be able to change its own password at
`/portal/profile`, `/admin/profile` or `/assessor/profile` via
`POST /api/account/password`.

**SEC-13** — The password-change endpoint **shall**:

1. require the current password and verify it on a throwaway client, so the
   caller's session is not disturbed;
2. enforce a minimum of 8 characters and a maximum of 72 bytes (bcrypt
   truncates beyond 72), and reject a new password equal to the current one;
3. apply the change **through the caller's own session**, not
   `auth.admin.updateUserById()` — the admin API revokes every session
   including the caller's, which would eject the user to the login screen;
4. leave the caller signed in on the current device while other sessions are
   invalidated;
5. write an `account.password_changed` entry to the audit log.

### 4.5 Evidence Integrity and Audit

**SEC-14** — Every uploaded artifact and document **shall** be SHA-256 hashed at
upload time (`artifacts.sha256`, `documents.sha256`) and the hash recorded, so
that evidence is tamper-evident.

**SEC-15** — Stored files **shall** reside in private Supabase Storage buckets
and **shall** be served only through time-limited signed URLs (1 hour).

**SEC-16** — The system **shall** maintain an append-only `audit_log` recording
actor, actor role, action, entity type, entity ID and metadata. An audit write
failure **shall not** fail the action being audited; it is logged to the console
instead.

**SEC-17** — The scheduled cron endpoint **shall** require the `CRON_SECRET`
bearer token.

---

## 5. Client Portal Requirements

Route prefix `/portal/*`. Role: `client`.

### 5.1 Dashboard

**FR-CL-01** — The dashboard **shall** show the client's engagement status,
assessment progress (answered control count), and any outstanding information
requests.

**FR-CL-02** — The dashboard **shall not** display SPRS scores, AI verdicts,
assessor determinations, synthesis or analytics.

**FR-CL-03** — All portal pages **shall** render correctly for a user with no
client record yet provisioned (empty-state paths are covered by the smoke test).

### 5.2 Scoping

**FR-CL-04** — The client **shall** complete a scoping profile capturing the
in-scope asset inventory and external service providers, which feeds the SSP
system boundary and the Customer Responsibility Matrix.

**FR-CL-05** — Scoping answers **shall** be editable only while the assessment
is in an editable state (`in_progress` or `remediation_required`).

### 5.3 Gap Assessment

**FR-CL-06** — The client **shall** answer each in-scope requirement with one of
`yes`, `partial`, `no`, `na`, with optional notes.

**FR-CL-07** — Selecting `na` **shall** prompt the client for an applicability
justification, which an assessor must validate.

**FR-CL-08** — The client **shall** be able to flag that no policy document
and/or no implementation artifact exists for a requirement.

**FR-CL-09** — Responses **shall** be saved incrementally (upsert per control),
so a partially completed assessment is never lost.

**FR-CL-10** — Only requirements in scope for the client's CMMC target level
(1 or 2) **shall** be presented.

### 5.4 Evidence Upload

**FR-CL-11** — The client **shall** upload evidence per requirement, categorized
as `policy` or `implementation`.

**FR-CL-12** — Uploads **shall** be validated for type and size before storage.

**FR-CL-13** — The client **shall** maintain a document library, and documents
**shall** be linkable to the requirements they support. Links carry a status
(`suggested`, `confirmed`, `rejected`) and a source (`ai`, `client`,
`assessor`).

### 5.5 Submission and Response

**FR-CL-14** — The client **shall** submit a completed assessment for review,
transitioning it to `submitted`.

**FR-CL-15** — The client **shall** view and respond to information requests
raised by staff.

**FR-CL-16** — The client **shall** view remediation guidance only once it has
been **approved** by staff; `draft` guidance is never visible to the client.

**FR-CL-17** — The client **shall** download their own published deliverables
and PDF report.

---

## 6. Assessor Workspace Requirements

Route prefix `/assessor/*`. Roles: `assessor`, `admin`.

### 6.1 Client List

**FR-AS-01** — The assessor **shall** see **all** clients, each with its active
assessment status, ordered by company name.

**FR-AS-02** — Where a client has multiple assessments, the workspace **shall**
surface the most operationally relevant one, by the priority order:
`under_review`, `remediation_required`, `submitted`, `resubmitted`, `approved`,
`finalized`, `in_progress`.

### 6.2 Client Detail and Guided Workflow

**FR-AS-03** — The client detail page **shall** present a next-step banner
stating the single most relevant action for the assessment's current state.

**FR-AS-04** — Assessment work **shall** be presented as an ordered, gated
workflow: (1) Control Review, (2) Gap Remediation, (3) Information Requests,
(4) Gap Intake Questions, (5) Compliance Artifacts. Later stages **shall** be
locked until a determination has been recorded for every control under review.

### 6.3 Determinations

**FR-AS-05** — For each control the client answered `yes` or `partial`, the
assessor **shall** record a determination of `met`, `partially_met`, `not_met`
or `needs_review`, with optional notes.

**FR-AS-06** — The assessor **shall** additionally record a verdict **per
SP 800-171A objective**, which rolls up to the control determination.

**FR-AS-07** — Assessor determinations **shall** override the client's
self-reported response when the score is computed.

**FR-AS-08** — The workspace **shall** display, per control, the client
response, client notes, the AI verdict and rationale, the objective-level AI
results, and the assessor's own determination.

### 6.4 Evidence Review

**FR-AS-09** — The assessor **shall** view and download all evidence the client
uploaded, grouped by requirement, with file name, size, upload date and
policy/implementation classification.

> The evidence markup is shared with the administrator client page
> (`components/EvidenceArtifactsSection.tsx`) so the two views cannot present
> different evidence.

### 6.5 Lifecycle Control

**FR-AS-10** — The assessor **shall** drive lifecycle transitions: begin review,
request remediation, approve, and finalize.

**FR-AS-11** — The assessor **shall** trigger an AI review run and observe its
progress.

**FR-AS-12** — The assessor **shall** write remediation guidance per gap and
approve it for client visibility.

**FR-AS-13** — The assessor **shall** raise information requests against the
client and read the responses.

**FR-AS-14** — The assessor **shall** download the SPRS submission worksheet and
the full assessment CSV.

---

## 7. Administrator Console Requirements

Route prefix `/admin/*`. Role: `admin` only.

**FR-AD-01** — The administrator **shall** have every assessor capability in
Section 6, on an equivalent client detail page.

**FR-AD-02** — The administrator **shall** create client accounts, which
provisions a Supabase auth user, a `clients` record, a `user_roles` row, and
sends an invite email. Failure at any step **shall** roll back the auth user.

**FR-AD-03** — The administrator **shall** edit client company information:
company name, contact, phone, CMMC target level, engagement stage, engagement
type and notes.

**FR-AD-04** — The administrator **shall** change a client's email address,
disable a client account, delete a client account, and reset a client's
password.

**FR-AD-05** — The administrator **shall** invite assessor accounts and reset
assessor passwords.

**FR-AD-06** — The administrator **shall** assign an assessor to an assessment.

**FR-AD-07** — The administrator **shall** view cross-client analytics.

---

## 8. AI Review Engine Requirements

**FR-AI-01** — The system **shall** evaluate each client response against the
SP 800-171A objectives for that requirement using Claude
(`claude-sonnet-4-6`), producing a verdict of `met`, `partially_met`,
`not_met` or `needs_review` plus a written rationale.

**FR-AI-02** — The AI **shall** return per-objective results, stored in
`control_ai_feedback.objective_results`.

**FR-AI-03** — The AI **shall** note when an objective cannot be confirmed from
submitted evidence alone and requires a live Interview or Test method.

**FR-AI-04** — Review runs **shall** be tracked in `ai_review_runs` with status
`running`, `completed` or `failed`, so progress is observable and a failed run
is distinguishable from an unstarted one.

**FR-AI-05** — The system **shall** produce an engagement-level synthesis
(`assessment_summaries`): overall verdict (`ready`, `conditional`,
`not_ready`), narrative, SPRS estimate, POA&M eligibility, domain roll-ups, top
blockers and detected contradictions.

**FR-AI-06** — The AI **shall not** compute or adjust the SPRS score
(see REG-01).

**FR-AI-07** — AI output **shall** be advisory. An assessor determination
**shall** always take precedence.

**FR-AI-08** — The system **shall** analyze uploaded documents to suggest
control mappings, recorded as `suggested` links for human confirmation.

---

## 9. Remediation Automation Requirements

Applies to clients with `engagement_type = 'remediation'`.

**FR-RM-01** — The system **shall** generate a consolidated intake
questionnaire covering every gap at once, de-duplicated so a question asked once
(for example, "which MFA tool?") feeds every control it informs. Each question
**shall** be tagged with the controls it informs.

**FR-RM-02** — The system **shall** generate, in a single run, the **SSP**,
**POA&M**, **policy and procedure templates**, and **Customer Responsibility
Matrix**. Per-control configuration baselines remain on demand.

**FR-RM-03** — The Customer Responsibility Matrix **shall** map every control to
a responsible party (Client / MSP-ESP / Cloud Provider / Shared), grounded in
the scoping profile.

**FR-RM-04** — Publishing a policy bundle or SSP **shall** materialize it as a
mapped evidence document (a `documents` row plus confirmed
`document_control_links`), so the next assessment automatically sees it.

**FR-RM-05** — Artifact publication **shall** be idempotent, keyed on
`documents.source_artifact_id`.

**FR-RM-06** — Generated artifacts **shall** carry `draft` or `finalized`
status, and **shall** record the controls they cover
(`generated_artifacts.covers_controls`).

---

## 10. Reporting and Compliance Lifecycle

### 10.1 Assessment Lifecycle

**FR-RP-01** — An assessment **shall** move through these states:

```
in_progress → submitted → under_review → remediation_required
            → resubmitted → approved → finalized → archived
```

### 10.2 Deliverables

**FR-RP-02** — The system **shall** produce a branded PDF report. The cover and
every content-page running header **shall** carry the Galaxy orbit mark as
vector artwork.

**FR-RP-03** — The system **shall** produce an SPRS submission worksheet
containing the score, itemized deductions, POA&M eligibility and a senior
official affirmation block. It **shall** be reachable from both the admin and
assessor client pages, and never by a client.

**FR-RP-04** — The system **shall** export a full assessment CSV containing
every in-scope control with the client response, AI verdict, assessor verdict,
per-objective roll-up and notes.

**FR-RP-05** — Reports **shall** be stored privately and delivered by signed URL
with a 1-hour expiry. Downloads **shall** be timestamped.

### 10.3 Annual Re-Affirmation

**FR-RP-06** — A daily cron (13:00 UTC, `vercel.json` →
`/api/cron/reaffirmation`) **shall** email clients approximately 11 months after
finalization to prompt annual re-affirmation.

**FR-RP-07** — Each client **shall** be reminded at most once per cycle, tracked
by `assessments.reaffirmation_reminded_at`.

---

## 11. Data Model

### 11.1 Tables

| Table | Purpose |
|---|---|
| `user_roles` | Authoritative role assignment (`admin` / `assessor` / `client`) |
| `clients` | Client company record, CMMC target level, engagement stage and type |
| `controls` | The 110 NIST SP 800-171 Rev 2 requirements |
| `assessments` | One assessment cycle per client, with lifecycle status |
| `assessment_responses` | Per-control client response, notes and evidence flags |
| `assessment_scoping` | Scoping profile answers |
| `assessment_summaries` | Engagement-level AI synthesis |
| `assessor_determinations` | Assessor verdict per control, plus per-objective verdicts |
| `control_ai_feedback` | AI verdict, rationale and per-objective results |
| `ai_review_runs` | AI run tracking (`running` / `completed` / `failed`) |
| `artifacts` | Client-uploaded evidence, with SHA-256 |
| `documents` | Document library, with SHA-256 and provenance |
| `document_control_links` | Document-to-control mapping with status and source |
| `generated_artifacts` | System-generated SSP / POA&M / policy / matrix output |
| `remediation_notes` | Remediation guidance, `draft` or `approved` |
| `information_requests` | Staff requests to the client and their responses |
| `reports` | Generated PDF report records and download timestamps |
| `audit_log` | Append-only action trail |

### 11.2 Key Enumerations

| Field | Values |
|---|---|
| `user_roles.role` | `admin`, `assessor`, `client` |
| `clients.cmmc_target_level` | `1`, `2` |
| `clients.engagement_stage` | `lead`, `active`, `completed` |
| `clients.engagement_type` | `assessment`, `remediation` |
| `assessment_responses.response` | `yes`, `partial`, `no`, `na` |
| `control_ai_feedback.verdict` | `met`, `partially_met`, `not_met`, `needs_review` |
| `assessor_determinations.assessor_verdict` | `met`, `partially_met`, `not_met`, `needs_review` |
| `remediation_notes.status` | `draft`, `approved` |
| `information_requests.status` | `pending`, `responded`, `closed` |
| `information_requests.request_type` | `manual`, `ai_intake` |
| `generated_artifacts.status` | `draft`, `finalized` |
| `documents.doc_type` | `policy`, `procedure`, `plan`, `diagram`, `config`, `log`, `report`, `other` |
| `document_control_links.status` | `suggested`, `confirmed`, `rejected` |
| `document_control_links.source` | `ai`, `client`, `assessor` |
| `assessment_summaries.overall_verdict` | `ready`, `conditional`, `not_ready` |

### 11.3 Migrations

**DATA-01** — Schema changes **shall** be delivered as sequentially numbered SQL
migrations in `supabase/migrations/`, applied in order. Twenty migrations exist
as of this version; see `README.md` for the per-migration summary.

---

## 12. Non-Functional Requirements

**NFR-01 (Availability)** — The system is hosted on Vercel with Supabase as the
managed data tier; availability follows those providers' SLAs.

**NFR-02 (Confidentiality)** — Client data **shall** be visible only to that
client and to Galaxy staff. Cross-client leakage is prevented by explicit
ownership checks in every client-facing route.

**NFR-03 (Auditability)** — Every state-changing staff action **shall** be
attributable to an actor and a role through `audit_log`.

**NFR-04 (Data residency)** — All data resides in the single Supabase project.

**NFR-05 (Accessibility)** — Interactive elements **shall** carry a visible
keyboard focus ring, and the interface **shall** honour
`prefers-reduced-motion`.

**NFR-06 (Browser support)** — The system targets current evergreen desktop
browsers. It is not optimized for mobile use.

**NFR-07 (Secrets)** — Service-role keys and API keys **shall** be server-side
only and **shall never** be exposed to the browser. Only `NEXT_PUBLIC_*`
variables may reach the client bundle.

---

## 13. Excluded Scope

The following are explicitly **not** in scope for the current system:

| Excluded | Note |
|---|---|
| CUI/FCI storage or processing | Prohibited by policy notice; not technically enforced |
| Public self-registration | Accounts are administrator-provisioned only |
| Direct SPRS submission to DoD | The system produces a submission-ready worksheet; filing is manual |
| C3PAO certification workflow | The system supports readiness, not the formal certification audit |
| Multi-factor authentication | Not currently implemented |
| Mobile applications | Web only |
| Multi-tenant Galaxy partners | Single consulting organization |
| Client-to-client visibility | No shared or benchmarking views |
| Assessor account administration | Deliberately administrator-only (SEC-05) |
| Automated staging environment | Single production Supabase project |

---

## 14. Verification and Testing

### 15.1 Unit Tests

**VER-01** — `npm test` (Vitest) **shall** cover SPRS scoring rules, catalog
integrity (110 requirements, 17 Level 1 practices, 320 objectives) and upload
validation. Twenty-five tests as of this version.

### 15.2 Route Smoke Test

**VER-02** — `npm run smoke [baseUrl]` **shall** sign in as an admin, an
assessor and a client, and request every `app/**/page.tsx` route as its owning
role. Thirty-seven checks as of this version.

**VER-03** — The smoke test **shall** additionally verify:

- portal pages render with no client record provisioned (empty-state branches);
- each role is refused access to the other roles' areas;
- signed-out requests to protected routes are refused;
- an administrator can render the assessor client page (staff parity).

**VER-04** — Routes **shall** be discovered from the filesystem, so a newly
added page is covered without editing the test.

**VER-05** — The smoke test **shall** create one throwaway user per role plus a
temporary client record and remove them in a `finally` block.
`npm run smoke:cleanup` removes anything a hard-killed run leaves behind.

> **Rationale.** Neither `npm test` nor `next build` can catch a server
> component that renders markup React rejects — it compiles cleanly and throws
> only at request time, and only when that branch actually renders. A signed-in
> request to every route is the cheapest control that detects this class of
> defect before a user does.

### 15.3 Release Verification

**VER-06** — Before a release is considered verified, the following **shall**
pass: `npx tsc --noEmit`, `npm test`, `npm run build`, and `npm run smoke`
against the deployed URL.

---

## 15. Deployment and Operations

**OPS-01** — Deployment **shall** be continuous from `master`; a push triggers a
Vercel build.

**OPS-02** — Database migrations **shall** be applied manually to Supabase, in
order, before or with the deployment that requires them.

**OPS-03** — A deployment **shall** be confirmed live by observing a changed
Next.js `buildId` at the production URL, not by elapsed time.

**OPS-04** — After a deployment touching authentication, authorization or
routing, `npm run smoke` **shall** be run against the production URL, followed
by `npm run smoke:cleanup` verification that no test records remain.

**OPS-05** — This specification is maintained as Markdown and rendered to Word
for distribution. Any change to the Markdown **shall** be followed by
`npm run docs:srs-docx` in the same commit, so the distributed document cannot
fall behind the source.

---

## 16. Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-09-03 | Initial SRS, written against the shipped system. Documents the three-role model with assessor/admin parity on assessment work (SEC-04/05), the Supabase client discipline that governs staff data access (ARCH-03/04/05, SEC-08/09), self-service password change (SEC-12/13), the route smoke test (VER-02–05). |

---

*Prepared by Galaxy Consulting engineering. This document describes the system
as built; where behaviour and document disagree, the code is authoritative and
this document is a defect.*
