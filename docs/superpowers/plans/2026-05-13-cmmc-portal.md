# Galaxy CMMC Portal — Full Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a full-stack Next.js 14 CMMC compliance portal for Galaxy Consulting — client gap assessment, admin management panel, and branded PDF reports — backed by Supabase Auth + PostgreSQL.

**Architecture:** Next.js 14 App Router with two protected route groups (`/portal/*` for clients, `/admin/*` for Galaxy staff). Supabase handles auth (email/password, role-based), PostgreSQL stores assessments/responses/clients, and Supabase Storage holds generated PDF reports. The existing JSX prototype (`galaxy-cmmc-portal.jsx`) provides the complete UI design and is ported control-by-control into real pages.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS v3, Supabase (Auth + PostgreSQL + Storage), @react-pdf/renderer, Shadcn/ui, Vercel

---

## File Map

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Root HTML shell, DM Sans font |
| `app/login/page.tsx` | Email/password login form |
| `app/portal/layout.tsx` | Client sidebar shell |
| `app/portal/dashboard/page.tsx` | Compliance score, domain bars, gap table |
| `app/portal/assessment/page.tsx` | Step-through control questionnaire |
| `app/portal/reports/page.tsx` | List and download PDF reports |
| `app/portal/profile/page.tsx` | Account settings stub |
| `app/admin/layout.tsx` | Admin sidebar shell |
| `app/admin/dashboard/page.tsx` | All-clients pipeline overview |
| `app/admin/clients/page.tsx` | Client list table |
| `app/admin/clients/[id]/page.tsx` | Individual client + assessment detail |
| `app/api/assessment/route.ts` | GET/POST assessment responses |
| `app/api/reports/route.ts` | POST generate PDF, GET download URL |
| `app/api/clients/route.ts` | GET/POST clients (admin only) |
| `components/ScoreGauge.tsx` | SVG circular score ring |
| `components/DomainBar.tsx` | Domain progress bar row |
| `components/Sidebar.tsx` | Shared sidebar nav |
| `components/pdf/ReportTemplate.tsx` | @react-pdf branded report template |
| `lib/supabase.ts` | Browser Supabase client |
| `lib/supabase-server.ts` | Server Supabase client (cookies) |
| `lib/scoring.ts` | Assessment scoring calculation |
| `lib/controls.ts` | Controls lookup helpers |
| `data/nist-800-171-controls.json` | All 110 NIST SP 800-171 Rev 2 controls |
| `supabase/migrations/001_initial.sql` | Full DB schema |
| `middleware.ts` | Route protection by role |
| `.env.local` | Environment variables (not committed) |

---

## Task 1: Initialize Next.js Project & Install Dependencies

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `.env.local`
- Create: `.gitignore` addition

- [ ] **Step 1: Scaffold the project**

```bash
cd /c/projects/galaxy
npx create-next-app@14 . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

Expected: Next.js 14 project created in `/c/projects/galaxy/` with TypeScript, Tailwind, App Router.

- [ ] **Step 2: Install all additional dependencies**

```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs @supabase/ssr \
  @react-pdf/renderer \
  lucide-react \
  clsx
```

- [ ] **Step 3: Install Shadcn/ui**

```bash
npx shadcn-ui@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Then add components:

```bash
npx shadcn-ui@latest add button input label textarea badge table card
```

- [ ] **Step 4: Create .env.local**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Add .env.local to .gitignore**

```bash
echo ".env.local" >> .gitignore
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: `ready - started server on 0.0.0.0:3000`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js 14 project with Supabase and PDF deps"
```

---

## Task 2: Supabase Client Files

**Files:**
- Create: `lib/supabase.ts`
- Create: `lib/supabase-server.ts`

- [ ] **Step 1: Create browser Supabase client**

Create `lib/supabase.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create server Supabase client**

Create `lib/supabase-server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}

export function createServiceSupabaseClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/
git commit -m "feat: add Supabase browser and server client helpers"
```

---

## Task 3: Database Schema Migration

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create migration directory**

```bash
mkdir -p supabase/migrations
```

- [ ] **Step 2: Write the schema**

Create `supabase/migrations/001_initial.sql`:

```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Clients table (company records, linked to Supabase auth users)
create table clients (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  phone text,
  cmmc_target_level integer not null default 2 check (cmmc_target_level in (1, 2)),
  engagement_stage text not null default 'lead' check (engagement_stage in ('lead', 'active', 'completed')),
  notes text,
  created_at timestamptz default now()
);

-- Controls table (pre-loaded, read-only)
create table controls (
  id varchar primary key,         -- e.g. "AC.1.001"
  domain text not null,           -- e.g. "Access Control"
  domain_code varchar(2) not null, -- e.g. "AC"
  level integer not null check (level in (1, 2)),
  description text not null,
  weight integer not null default 1
);

-- Assessments table
create table assessments (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  total_score integer,
  started_at timestamptz default now(),
  completed_at timestamptz
);

-- Assessment responses (one row per control per assessment)
create table assessment_responses (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  control_id varchar references controls(id),
  response text not null check (response in ('yes', 'partial', 'no', 'na')),
  notes text,
  updated_at timestamptz default now(),
  unique(assessment_id, control_id)
);

-- Reports table
create table reports (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  storage_path varchar,
  generated_at timestamptz default now(),
  downloaded_at timestamptz
);

-- User roles (stored in auth.users metadata, but mirrored here for easy querying)
create table user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'client' check (role in ('admin', 'client'))
);

-- RLS Policies
alter table clients enable row level security;
alter table assessments enable row level security;
alter table assessment_responses enable row level security;
alter table reports enable row level security;
alter table controls enable row level security;
alter table user_roles enable row level security;

-- Controls: readable by all authenticated users
create policy "controls_read_all" on controls
  for select using (auth.role() = 'authenticated');

-- Clients: users can only see their own record; admins see all
create policy "clients_own" on clients
  for all using (
    user_id = auth.uid() or
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Assessments: linked via client
create policy "assessments_via_client" on assessments
  for all using (
    exists (
      select 1 from clients where id = assessments.client_id and (
        clients.user_id = auth.uid() or
        exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
      )
    )
  );

-- Responses: linked via assessment
create policy "responses_via_assessment" on assessment_responses
  for all using (
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = assessment_responses.assessment_id
      and (
        c.user_id = auth.uid() or
        exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
      )
    )
  );

-- Reports: same as assessments
create policy "reports_via_assessment" on reports
  for all using (
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = reports.assessment_id
      and (
        c.user_id = auth.uid() or
        exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
      )
    )
  );

-- User roles: only admins can manage roles
create policy "user_roles_admin_only" on user_roles
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );
```

- [ ] **Step 3: Apply migration in Supabase dashboard**

Go to your Supabase project → SQL Editor → paste the contents of `001_initial.sql` → Run.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema migration"
```

---

## Task 4: Controls Seed Data (All 110 NIST SP 800-171 Rev 2)

**Files:**
- Create: `data/nist-800-171-controls.json`
- Create: `lib/controls.ts`

> **Note:** Practice IDs follow CMMC Model v2.0 format (DOMAIN.LEVEL.NNN). Verify against official DoD CMMC 2.0 documentation before C3PAO submission.

- [ ] **Step 1: Create controls JSON**

Create `data/nist-800-171-controls.json`:

```json
[
  { "id": "AC.1.001", "domain": "Access Control", "domain_code": "AC", "level": 1, "weight": 1, "description": "Limit information system access to authorized users, processes acting on behalf of authorized users, and devices (including other information systems)." },
  { "id": "AC.1.002", "domain": "Access Control", "domain_code": "AC", "level": 1, "weight": 1, "description": "Limit information system access to the types of transactions and functions that authorized users are permitted to execute." },
  { "id": "AC.2.003", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Control the flow of CUI in accordance with approved authorizations." },
  { "id": "AC.2.004", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Separate the duties of individuals to reduce the risk of malevolent activity without collusion." },
  { "id": "AC.2.005", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Provide privacy and security notices consistent with CUI rules." },
  { "id": "AC.2.006", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Limit use of portable storage devices on external systems." },
  { "id": "AC.2.007", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Employ the principle of least privilege, including for specific security functions and privileged accounts." },
  { "id": "AC.2.008", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Use non-privileged accounts or roles when accessing non-security functions." },
  { "id": "AC.2.009", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs." },
  { "id": "AC.2.010", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Limit unsuccessful logon attempts." },
  { "id": "AC.2.011", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Use session lock with pattern-hiding displays after a period of inactivity." },
  { "id": "AC.2.012", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Terminate (automatically) a user session after a defined condition." },
  { "id": "AC.2.013", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Monitor and control remote access sessions." },
  { "id": "AC.2.014", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Employ cryptographic mechanisms to protect the confidentiality of remote access sessions." },
  { "id": "AC.2.015", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Route remote access via managed access control points." },
  { "id": "AC.2.016", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Authorize remote execution of privileged commands via remote access only for documented operational needs." },
  { "id": "AC.2.017", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Authorize wireless access prior to allowing such connections." },
  { "id": "AC.2.018", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Protect wireless access using authentication and encryption." },
  { "id": "AC.2.019", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Control connection of mobile devices." },
  { "id": "AC.2.020", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Encrypt CUI on mobile devices and mobile computing platforms." },
  { "id": "AC.2.021", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Verify and control/limit connections to external information systems." },
  { "id": "AC.2.022", "domain": "Access Control", "domain_code": "AC", "level": 2, "weight": 1, "description": "Control CUI posted or processed on publicly accessible information systems." },

  { "id": "AT.2.056", "domain": "Awareness & Training", "domain_code": "AT", "level": 2, "weight": 1, "description": "Ensure that personnel are aware of the security risks associated with their activities and of the applicable policies, standards, and procedures related to the security of organizational information systems." },
  { "id": "AT.2.057", "domain": "Awareness & Training", "domain_code": "AT", "level": 2, "weight": 1, "description": "Ensure that organizational personnel are adequately trained to carry out their assigned information security responsibilities and duties." },
  { "id": "AT.3.058", "domain": "Awareness & Training", "domain_code": "AT", "level": 2, "weight": 1, "description": "Provide security awareness training on recognizing and reporting potential threats, including social engineering attacks such as phishing." },

  { "id": "AU.2.041", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Ensure that the actions of individual information system users can be uniquely traced to those users so they can be held accountable for their actions." },
  { "id": "AU.2.042", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity." },
  { "id": "AU.2.043", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Review and update logged events." },
  { "id": "AU.2.044", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Alert in the event of an audit logging process failure." },
  { "id": "AU.2.045", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity." },
  { "id": "AU.2.046", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Provide audit record reduction and report generation to support on-demand analysis and reporting." },
  { "id": "AU.2.047", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records." },
  { "id": "AU.3.045", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Review audit logs to identify unauthorized system access, usage, and anomalies on an ongoing basis." },
  { "id": "AU.3.046", "domain": "Audit & Accountability", "domain_code": "AU", "level": 2, "weight": 1, "description": "Protect audit information and audit tools from unauthorized access, modification, and deletion." },

  { "id": "CM.2.061", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Establish and maintain baseline configurations and inventories of organizational information systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles." },
  { "id": "CM.2.062", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Establish and enforce security configuration settings for information technology products employed in organizational information systems." },
  { "id": "CM.2.063", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Track, review, approve, and log changes to organizational information systems." },
  { "id": "CM.2.064", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Analyze the security impact of changes prior to implementation." },
  { "id": "CM.2.065", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational information systems." },
  { "id": "CM.3.068", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services." },
  { "id": "CM.3.069", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software." },
  { "id": "CM.3.071", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Establish and maintain an inventory of organizational information systems." },
  { "id": "CM.3.072", "domain": "Configuration Management", "domain_code": "CM", "level": 2, "weight": 1, "description": "Perform penetration testing periodically, leveraging automated scanning tools and ad hoc tests using subject matter experts." },

  { "id": "IA.1.076", "domain": "Identification & Authentication", "domain_code": "IA", "level": 1, "weight": 1, "description": "Identify information system users, processes acting on behalf of users, and devices." },
  { "id": "IA.1.077", "domain": "Identification & Authentication", "domain_code": "IA", "level": 1, "weight": 1, "description": "Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access." },
  { "id": "IA.2.078", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Enforce a minimum password complexity and change of characters when new passwords are created." },
  { "id": "IA.2.079", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Prohibit password reuse for a specified number of generations." },
  { "id": "IA.2.080", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Allow temporary password use for system logons with an immediate change to a permanent password." },
  { "id": "IA.2.081", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Store and transmit only cryptographically-protected passwords." },
  { "id": "IA.2.082", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Obscure feedback of authentication information." },
  { "id": "IA.3.083", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts." },
  { "id": "IA.3.084", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts." },
  { "id": "IA.3.085", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Employ cryptographic mechanisms to authenticate between systems when required by the organization." },
  { "id": "IA.3.086", "domain": "Identification & Authentication", "domain_code": "IA", "level": 2, "weight": 1, "description": "Disable identifiers after a defined inactivity period." },

  { "id": "IR.2.092", "domain": "Incident Response", "domain_code": "IR", "level": 2, "weight": 1, "description": "Establish an operational incident-handling capability for organizational information systems that includes preparation, detection, analysis, containment, recovery, and user response activities." },
  { "id": "IR.2.093", "domain": "Incident Response", "domain_code": "IR", "level": 2, "weight": 1, "description": "Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization." },
  { "id": "IR.2.094", "domain": "Incident Response", "domain_code": "IR", "level": 2, "weight": 1, "description": "Test the organizational incident response capability." },

  { "id": "MA.2.111", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Perform maintenance on organizational information systems." },
  { "id": "MA.2.112", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Provide controls on the tools, techniques, mechanisms, and personnel that conduct information system maintenance." },
  { "id": "MA.2.113", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Ensure equipment removed for off-site maintenance is sanitized of any CUI." },
  { "id": "MA.2.114", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Check media containing diagnostic and test programs for malicious code before the media are used in organizational information systems." },
  { "id": "MA.3.115", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Require MFA to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete." },
  { "id": "MA.3.116", "domain": "Maintenance", "domain_code": "MA", "level": 2, "weight": 1, "description": "Supervise the maintenance activities of maintenance personnel without required access authorization." },

  { "id": "MP.1.118", "domain": "Media Protection", "domain_code": "MP", "level": 1, "weight": 1, "description": "Sanitize or destroy information system media before disposal or reuse." },
  { "id": "MP.2.119", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital." },
  { "id": "MP.2.120", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Control access to media containing CUI and maintain accountability for media during transport." },
  { "id": "MP.2.121", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Control the use of removable media on system components." },
  { "id": "MP.3.122", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Mark media with necessary CUI markings and distribution limitations." },
  { "id": "MP.3.123", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Prohibit the use of portable storage devices when such devices have no identifiable owner." },
  { "id": "MP.3.124", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Implement cryptographic mechanisms to protect the confidentiality of CUI stored on portable digital media." },
  { "id": "MP.3.125", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Implement cryptographic mechanisms to protect the confidentiality of CUI during transmission." },
  { "id": "MP.3.126", "domain": "Media Protection", "domain_code": "MP", "level": 2, "weight": 1, "description": "Implement sanitization mechanisms with strength and integrity commensurate with the security category or classification of the information." },

  { "id": "PS.2.127", "domain": "Personnel Security", "domain_code": "PS", "level": 2, "weight": 1, "description": "Screen individuals prior to authorizing access to organizational information systems containing CUI." },
  { "id": "PS.3.128", "domain": "Personnel Security", "domain_code": "PS", "level": 2, "weight": 1, "description": "Ensure that CUI is protected during and after personnel actions such as terminations and transfers." },

  { "id": "PE.1.131", "domain": "Physical Protection", "domain_code": "PE", "level": 1, "weight": 1, "description": "Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals." },
  { "id": "PE.1.132", "domain": "Physical Protection", "domain_code": "PE", "level": 1, "weight": 1, "description": "Escort visitors and monitor visitor activity; maintain audit logs of physical access; and control and manage physical access devices." },
  { "id": "PE.2.133", "domain": "Physical Protection", "domain_code": "PE", "level": 2, "weight": 1, "description": "Escort visitors and monitor visitor activity in facilities where CUI is processed or stored." },
  { "id": "PE.2.134", "domain": "Physical Protection", "domain_code": "PE", "level": 2, "weight": 1, "description": "Maintain audit logs of physical access." },
  { "id": "PE.3.136", "domain": "Physical Protection", "domain_code": "PE", "level": 2, "weight": 1, "description": "Enforce safeguarding measures for CUI at alternate work sites." },
  { "id": "PE.3.137", "domain": "Physical Protection", "domain_code": "PE", "level": 2, "weight": 1, "description": "Control and manage physical access devices." },

  { "id": "RA.2.141", "domain": "Risk Assessment", "domain_code": "RA", "level": 2, "weight": 1, "description": "Periodically assess the risk to organizational operations (including mission, functions, image, or reputation), organizational assets, and individuals, resulting from the operation of organizational information systems and the associated processing, storage, or transmission of CUI." },
  { "id": "RA.2.142", "domain": "Risk Assessment", "domain_code": "RA", "level": 2, "weight": 1, "description": "Scan for vulnerabilities in organizational information systems and applications periodically and when new vulnerabilities affecting those systems are identified." },
  { "id": "RA.3.144", "domain": "Risk Assessment", "domain_code": "RA", "level": 2, "weight": 1, "description": "Periodically perform risk assessments to identify and prioritize risks according to defined risk categories, risk sources, and risk measurement criteria." },

  { "id": "CA.2.157", "domain": "Security Assessment", "domain_code": "CA", "level": 2, "weight": 1, "description": "Periodically assess the security controls in organizational information systems to determine if the controls are effective in their application." },
  { "id": "CA.2.158", "domain": "Security Assessment", "domain_code": "CA", "level": 2, "weight": 1, "description": "Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational information systems." },
  { "id": "CA.2.159", "domain": "Security Assessment", "domain_code": "CA", "level": 2, "weight": 1, "description": "Monitor information system security controls on an ongoing basis to ensure the continued effectiveness of the controls." },
  { "id": "CA.3.161", "domain": "Security Assessment", "domain_code": "CA", "level": 2, "weight": 1, "description": "Establish and maintain a system security plan that describes system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems." },

  { "id": "SC.1.175", "domain": "System & Comms Protection", "domain_code": "SC", "level": 1, "weight": 1, "description": "Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems." },
  { "id": "SC.1.176", "domain": "System & Comms Protection", "domain_code": "SC", "level": 1, "weight": 1, "description": "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks." },
  { "id": "SC.2.178", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Prohibit remote activation of collaborative computing devices and provide indication of use to present to users." },
  { "id": "SC.3.177", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Employ FIPS-validated cryptography when used to protect the confidentiality of CUI." },
  { "id": "SC.3.179", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Use encrypted sessions for the management of network devices." },
  { "id": "SC.3.180", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Employ architectural designs, software development techniques, and systems engineering principles that promote security effectiveness in organizational information systems." },
  { "id": "SC.3.181", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Separate user functionality from system management functionality." },
  { "id": "SC.3.182", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Prevent unauthorized and unintended information transfer via shared system resources." },
  { "id": "SC.3.183", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception)." },
  { "id": "SC.3.184", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Prevent remote devices from simultaneously using a non-remote connection with the system and communicating via some other connection to resources in external networks (i.e., split tunneling)." },
  { "id": "SC.3.185", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards." },
  { "id": "SC.3.186", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Terminate network connections associated with communications sessions after a defined period of inactivity." },
  { "id": "SC.3.187", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Establish and manage cryptographic keys for cryptography employed in organizational information systems." },
  { "id": "SC.3.188", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Employ only government-approved and government-managed cryptographic protective measures in organizational information systems." },
  { "id": "SC.3.189", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Control and monitor the use of mobile code." },
  { "id": "SC.3.190", "domain": "System & Comms Protection", "domain_code": "SC", "level": 2, "weight": 1, "description": "Control and monitor the use of voice over internet protocol (VoIP) technologies." },

  { "id": "SI.1.210", "domain": "System & Info Integrity", "domain_code": "SI", "level": 1, "weight": 1, "description": "Identify, report, and correct information and information system flaws in a timely manner." },
  { "id": "SI.1.211", "domain": "System & Info Integrity", "domain_code": "SI", "level": 1, "weight": 1, "description": "Provide protection from malicious code at appropriate locations within organizational information systems." },
  { "id": "SI.1.212", "domain": "System & Info Integrity", "domain_code": "SI", "level": 1, "weight": 1, "description": "Update malicious code protection mechanisms when new releases are available." },
  { "id": "SI.1.213", "domain": "System & Info Integrity", "domain_code": "SI", "level": 1, "weight": 1, "description": "Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed." },
  { "id": "SI.2.214", "domain": "System & Info Integrity", "domain_code": "SI", "level": 2, "weight": 1, "description": "Monitor organizational information systems to detect attacks and indicators of potential attacks and unauthorized local, network, and remote connections." },
  { "id": "SI.2.216", "domain": "System & Info Integrity", "domain_code": "SI", "level": 2, "weight": 1, "description": "Monitor organizational information systems, including inbound and outbound communications traffic, to detect cybersecurity events." },
  { "id": "SI.3.218", "domain": "System & Info Integrity", "domain_code": "SI", "level": 2, "weight": 1, "description": "Employ spam protection mechanisms at information system access entry and exit points." }
]
```

- [ ] **Step 2: Create controls helper**

Create `lib/controls.ts`:

```typescript
import controlsData from "@/data/nist-800-171-controls.json";

export type Control = {
  id: string;
  domain: string;
  domain_code: string;
  level: number;
  weight: number;
  description: string;
};

export const CONTROLS: Control[] = controlsData as Control[];

export const DOMAINS = [
  { code: "AC", name: "Access Control", controls: 22, color: "#00C9FF" },
  { code: "AT", name: "Awareness & Training", controls: 3, color: "#4DFFA0" },
  { code: "AU", name: "Audit & Accountability", controls: 9, color: "#FFB347" },
  { code: "CM", name: "Configuration Management", controls: 9, color: "#FF6B9D" },
  { code: "IA", name: "Identification & Authentication", controls: 11, color: "#A78BFA" },
  { code: "IR", name: "Incident Response", controls: 3, color: "#F87171" },
  { code: "MA", name: "Maintenance", controls: 6, color: "#34D399" },
  { code: "MP", name: "Media Protection", controls: 9, color: "#60A5FA" },
  { code: "PS", name: "Personnel Security", controls: 2, color: "#FBBF24" },
  { code: "PE", name: "Physical Protection", controls: 6, color: "#F472B6" },
  { code: "RA", name: "Risk Assessment", controls: 3, color: "#818CF8" },
  { code: "CA", name: "Security Assessment", controls: 4, color: "#2DD4BF" },
  { code: "SC", name: "System & Comms Protection", controls: 16, color: "#FB923C" },
  { code: "SI", name: "System & Info Integrity", controls: 7, color: "#A3E635" },
] as const;

export function getControlsByDomain(domainCode: string): Control[] {
  return CONTROLS.filter((c) => c.domain_code === domainCode);
}

export function getDomain(code: string) {
  return DOMAINS.find((d) => d.code === code);
}
```

- [ ] **Step 3: Seed controls to Supabase**

Create `scripts/seed-controls.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import controls from "../data/nist-800-171-controls.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function seed() {
  const { error } = await supabase.from("controls").upsert(controls, { onConflict: "id" });
  if (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
  console.log(`Seeded ${controls.length} controls successfully.`);
}

seed();
```

Run the seed:

```bash
npx ts-node --project tsconfig.json -e "$(cat scripts/seed-controls.ts)"
# Or paste seed-controls.ts into Supabase SQL editor as INSERT statements
```

> **Alternative:** In Supabase SQL Editor, run:
> `INSERT INTO controls SELECT * FROM json_populate_recordset(null::controls, '[...paste JSON here...]');`

- [ ] **Step 4: Commit**

```bash
git add data/ lib/controls.ts scripts/
git commit -m "feat: add all 110 NIST 800-171 controls seed data and helpers"
```

---

## Task 5: Scoring Logic

**Files:**
- Create: `lib/scoring.ts`

- [ ] **Step 1: Write scoring module**

Create `lib/scoring.ts`:

```typescript
import { CONTROLS, DOMAINS, getDomain } from "./controls";

export type ResponseMap = Record<string, "yes" | "partial" | "no" | "na">;

export type DomainScore = {
  code: string;
  name: string;
  color: string;
  score: number;       // 0–100 percentage
  rawScore: number;
  maxScore: number;
  gapCount: number;
};

export type AssessmentScore = {
  overallScore: number;     // 0–100 percentage
  rawScore: number;
  maxScore: number;
  passed: number;
  partial: number;
  gaps: number;
  domainScores: DomainScore[];
  criticalGaps: typeof CONTROLS;
};

const RESPONSE_POINTS: Record<string, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  na: 0,
};

export function calculateScore(responses: ResponseMap): AssessmentScore {
  let rawScore = 0;
  let maxScore = 0;
  let passed = 0;
  let partial = 0;
  let gaps = 0;

  const domainScores: DomainScore[] = DOMAINS.map((domain) => {
    const controls = CONTROLS.filter((c) => c.domain_code === domain.code);
    let domainRaw = 0;
    let domainMax = 0;
    let domainGaps = 0;

    for (const control of controls) {
      const response = responses[control.id];
      if (!response || response === "na") continue;
      const points = RESPONSE_POINTS[response] * control.weight;
      domainRaw += points;
      domainMax += control.weight;
      if (response === "no") domainGaps++;
    }

    return {
      code: domain.code,
      name: domain.name,
      color: domain.color,
      score: domainMax > 0 ? Math.round((domainRaw / domainMax) * 100) : 0,
      rawScore: domainRaw,
      maxScore: domainMax,
      gapCount: domainGaps,
    };
  });

  for (const control of CONTROLS) {
    const response = responses[control.id];
    if (!response || response === "na") continue;
    rawScore += RESPONSE_POINTS[response] * control.weight;
    maxScore += control.weight;
    if (response === "yes") passed++;
    else if (response === "partial") partial++;
    else if (response === "no") gaps++;
  }

  const criticalGaps = CONTROLS.filter(
    (c) => responses[c.id] === "no" &&
    ["IR", "CA", "RA", "AU"].includes(c.domain_code)
  );

  return {
    overallScore: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
    rawScore,
    maxScore,
    passed,
    partial,
    gaps,
    domainScores,
    criticalGaps,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/scoring.ts
git commit -m "feat: add assessment scoring logic"
```

---

## Task 6: Route Protection Middleware

**Files:**
- Create/replace: `middleware.ts`

- [ ] **Step 1: Write middleware**

Create `middleware.ts` at project root:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) { return request.cookies.get(name)?.value; },
        set(name, value, options) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  const pathname = request.nextUrl.pathname;

  // Redirect unauthenticated users trying to access protected routes
  if (!session && (pathname.startsWith("/portal") || pathname.startsWith("/admin"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect authenticated users away from login
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/portal/dashboard", request.url));
  }

  // Admin-only routes: check role from user metadata
  if (pathname.startsWith("/admin")) {
    const role = session?.user?.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/portal/dashboard", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/portal/:path*", "/admin/:path*", "/login"],
};
```

- [ ] **Step 2: Commit**

```bash
git add middleware.ts
git commit -m "feat: add role-based route protection middleware"
```

---

## Task 7: Root Layout & Global Styles

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update root layout**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Galaxy CMMC Portal",
  description: "CMMC Compliance Assessment Platform — Galaxy Consulting, LLC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Update globals.css**

Replace `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #050B18;
  --bg-card: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.08);
  --text-primary: #E2E8F0;
  --text-muted: rgba(255, 255, 255, 0.4);
  --accent-blue: #00C9FF;
  --accent-green: #4DFFA0;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #050B18;
  color: #E2E8F0;
  min-height: 100vh;
}

textarea, input {
  font-family: inherit;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: configure root layout with DM Sans font and dark theme"
```

---

## Task 8: Shared Components (ScoreGauge, DomainBar, Sidebar)

**Files:**
- Create: `components/ScoreGauge.tsx`
- Create: `components/DomainBar.tsx`
- Create: `components/Sidebar.tsx`

- [ ] **Step 1: Create ScoreGauge**

Create `components/ScoreGauge.tsx`:

```tsx
type Props = {
  score: number;
  size?: number;
};

export default function ScoreGauge({ score, size = 120 }: Props) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? "#4DFFA0" : score >= 40 ? "#FFB347" : "#F87171";

  return (
    <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 - 4} textAnchor="middle" fill="#fff" fontSize={size > 100 ? 22 : 16} fontWeight={700}>
        {score}%
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={10}>
        Score
      </text>
    </svg>
  );
}
```

- [ ] **Step 2: Create DomainBar**

Create `components/DomainBar.tsx`:

```tsx
import { getDomain } from "@/lib/controls";

type Props = {
  domainCode: string;
  score: number;
};

export default function DomainBar({ domainCode, score }: Props) {
  const domain = getDomain(domainCode);
  if (!domain) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{domain.name}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: domain.color }}>{score}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${score}%`, background: domain.color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Sidebar**

Create `components/Sidebar.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

type NavItem = {
  id: string;
  href: string;
  icon: string;
  label: string;
};

type Props = {
  items: NavItem[];
  userName: string;
  userRole: string;
};

export default function Sidebar({ items, userName, userRole }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{
      width: 240, background: "rgba(255,255,255,0.03)",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column",
      position: "fixed", top: 0, left: 0, bottom: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          width: 36, height: 36, background: "linear-gradient(135deg, #00C9FF, #4DFFA0)",
          borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, marginBottom: 10,
        }}>🌌</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "0.5px" }}>Galaxy Consulting</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "1px", textTransform: "uppercase", marginTop: 2 }}>CMMC Portal</div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "16px 12px", flex: 1 }}>
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <a key={item.id} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: 500,
              background: active ? "rgba(0,201,255,0.1)" : "transparent",
              color: active ? "#00C9FF" : "rgba(255,255,255,0.5)",
              borderLeft: active ? "2px solid #00C9FF" : "2px solid transparent",
              textDecoration: "none", transition: "all 0.15s",
            }}>
              <span>{item.icon}</span> {item.label}
            </a>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #00C9FF44, #4DFFA044)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
          }}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{userName}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textTransform: "capitalize" }}>{userRole}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          width: "100%", padding: "7px 12px", borderRadius: 6, fontSize: 12,
          background: "rgba(248,113,113,0.08)", color: "#F87171",
          border: "1px solid rgba(248,113,113,0.2)", cursor: "pointer",
        }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/
git commit -m "feat: add shared ScoreGauge, DomainBar, and Sidebar components"
```

---

## Task 9: Login Page

**Files:**
- Create: `app/login/page.tsx`
- Delete: `app/page.tsx` (replace with redirect)

- [ ] **Step 1: Create login page**

Create `app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const role = data.user?.user_metadata?.role ?? "client";
    router.push(role === "admin" ? "/admin/dashboard" : "/portal/dashboard");
    router.refresh();
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#050B18", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52, background: "linear-gradient(135deg, #00C9FF, #4DFFA0)",
            borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, margin: "0 auto 16px",
          }}>🌌</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Galaxy CMMC Portal</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Galaxy Consulting, LLC</div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, padding: 32,
        }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.8px" }}>Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              placeholder="you@company.com"
              style={{
                width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
                color: "#E2E8F0", fontSize: 14,
              }}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.8px" }}>Password</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{
                width: "100%", padding: "11px 14px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
                color: "#E2E8F0", fontSize: 14,
              }}
            />
          </div>
          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, fontSize: 13, color: "#F87171" }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{
            width: "100%", padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", border: "none",
            opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          Contact Galaxy Consulting for access — ccooks@galaxyconsultingllc.com
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace home page with redirect**

Replace `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
```

- [ ] **Step 3: Commit**

```bash
git add app/login/ app/page.tsx
git commit -m "feat: add login page with Supabase auth"
```

---

## Task 10: Client Portal Layout

**Files:**
- Create: `app/portal/layout.tsx`

- [ ] **Step 1: Create client portal layout**

Create `app/portal/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const CLIENT_NAV = [
  { id: "dashboard", href: "/portal/dashboard", icon: "⬡", label: "Dashboard" },
  { id: "assessment", href: "/portal/assessment", icon: "☑", label: "Gap Assessment" },
  { id: "reports", href: "/portal/reports", icon: "⬇", label: "Reports" },
  { id: "profile", href: "/portal/profile", icon: "◉", label: "Profile" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/login");

  const userName = session.user.user_metadata?.full_name || session.user.email || "User";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={CLIENT_NAV} userName={userName} userRole="client" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/portal/layout.tsx
git commit -m "feat: add client portal layout with sidebar"
```

---

## Task 11: Client Dashboard Page

**Files:**
- Create: `app/portal/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard page**

Create `app/portal/dashboard/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import { DOMAINS } from "@/lib/controls";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  // Get client record
  const { data: client } = await supabase
    .from("clients")
    .select("*, assessments(id, status, started_at)")
    .eq("user_id", session.user.id)
    .single();

  // Get active assessment responses
  let responses: ResponseMap = {};
  let assessment = null;
  if (client?.assessments?.length) {
    assessment = client.assessments.find((a: { status: string }) => a.status === "in_progress") || client.assessments[0];
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", assessment.id);

    if (responseRows) {
      responses = Object.fromEntries(responseRows.map((r: { control_id: string; response: string }) => [r.control_id, r.response])) as ResponseMap;
    }
  }

  const score = calculateScore(responses);

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const label = { fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: 6 };

  const severityColor: Record<string, string> = { Critical: "#F87171", High: "#FB923C", Medium: "#FBBF24", Low: "#4DFFA0" };
  const severityBg: Record<string, string> = { Critical: "rgba(248,113,113,0.1)", High: "rgba(251,146,60,0.1)", Medium: "rgba(251,191,36,0.1)", Low: "rgba(77,255,160,0.1)" };

  function getSeverity(domainCode: string): "Critical" | "High" | "Medium" {
    const critical = ["IR", "CA"];
    const high = ["RA", "AU", "AT"];
    if (critical.includes(domainCode)) return "Critical";
    if (high.includes(domainCode)) return "High";
    return "Medium";
  }

  const gaps = score.criticalGaps.slice(0, 6).map((c) => ({
    id: c.id,
    domain: c.domain,
    severity: getSeverity(c.domain_code),
    description: c.description,
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Compliance Dashboard</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {client?.company_name || "Your Company"} — CMMC Level {client?.cmmc_target_level || 2} Assessment
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/portal/assessment" style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF",
            textDecoration: "none",
          }}>
            {assessment ? "Continue Assessment" : "Start Assessment"}
          </Link>
          <Link href="/portal/reports" style={{
            padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
            textDecoration: "none",
          }}>
            Download Report
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Overall Score", value: `${score.overallScore}%`, sub: `${score.rawScore} of ${score.maxScore} points`, color: score.overallScore >= 70 ? "#4DFFA0" : score.overallScore >= 40 ? "#FFB347" : "#F87171" },
          { label: "Gaps Identified", value: String(score.gaps), sub: `${score.criticalGaps.length} critical priority`, color: "#F87171" },
          { label: "Controls Passed", value: String(score.passed), sub: "fully compliant", color: "#4DFFA0" },
          { label: "Partial Controls", value: String(score.partial), sub: "remediation needed", color: "#FFB347" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={label}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Score + Domain Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Overall Compliance Score</div>
          <ScoreGauge score={score.overallScore} size={140} />
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <span style={{
              display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              color: "#FB923C", background: "rgba(251,146,60,0.1)",
            }}>
              {score.overallScore >= 70 ? "✓ On Track" : "⚠ Remediation Needed"}
            </span>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 8 }}>
              Score below 70% requires remediation before C3PAO audit
            </div>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Domain Breakdown</div>
          {score.domainScores.slice(0, 7).map((d) => (
            <DomainBar key={d.code} domainCode={d.code} score={d.score} />
          ))}
        </div>
      </div>

      {/* Priority Gaps */}
      {gaps.length > 0 && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Priority Gaps</div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{gaps.length} items require attention</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Control ID", "Domain", "Severity", "Description"].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gaps.map((g, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 0", fontSize: 12, fontWeight: 600, color: "#00C9FF", fontFamily: "monospace" }}>{g.id}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{g.domain}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: severityColor[g.severity], background: severityBg[g.severity] }}>
                      {g.severity}
                    </span>
                  </td>
                  <td style={{ padding: "12px 0", fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 400 }}>{g.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No assessment yet */}
      {!assessment && (
        <div style={{ ...card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 8 }}>No Assessment Started</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 24 }}>Begin your CMMC gap assessment to see compliance scores and recommendations.</div>
          <Link href="/portal/assessment" style={{
            padding: "12px 28px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
            textDecoration: "none", display: "inline-block",
          }}>
            Start Gap Assessment →
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/portal/dashboard/
git commit -m "feat: add client dashboard page with live scoring"
```

---

## Task 12: Assessment API Route

**Files:**
- Create: `app/api/assessment/route.ts`

- [ ] **Step 1: Create assessment API**

Create `app/api/assessment/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

// GET /api/assessment?clientId=xxx  — get or create assessment, return responses
export async function GET(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });

  // Verify client belongs to user (or user is admin)
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("user_id", session.user.id)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Get or create in-progress assessment
  let { data: assessment } = await supabase
    .from("assessments")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "in_progress")
    .single();

  if (!assessment) {
    const { data: newAssessment, error } = await supabase
      .from("assessments")
      .insert({ client_id: clientId, status: "in_progress" })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    assessment = newAssessment;
  }

  const { data: responses } = await supabase
    .from("assessment_responses")
    .select("control_id, response, notes")
    .eq("assessment_id", assessment!.id);

  return NextResponse.json({ assessmentId: assessment!.id, responses: responses || [] });
}

// POST /api/assessment  — upsert a single control response
export async function POST(req: NextRequest) {
  const supabase = createServiceSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assessmentId, controlId, response, notes } = body;

  if (!assessmentId || !controlId || !response) {
    return NextResponse.json({ error: "assessmentId, controlId, response required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("assessment_responses")
    .upsert(
      { assessment_id: assessmentId, control_id: controlId, response, notes: notes ?? null, updated_at: new Date().toISOString() },
      { onConflict: "assessment_id,control_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/assessment/
git commit -m "feat: add assessment GET/POST API route"
```

---

## Task 13: Client Assessment Page

**Files:**
- Create: `app/portal/assessment/page.tsx`

- [ ] **Step 1: Create assessment page**

Create `app/portal/assessment/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { CONTROLS, DOMAINS, getDomain } from "@/lib/controls";
import type { ResponseMap } from "@/lib/scoring";

type Response = "yes" | "partial" | "no" | "na";

export default function AssessmentPage() {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const supabase = createClient();

  // Load existing assessment on mount
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", session.user.id)
        .single();

      if (!client) { setLoaded(true); return; }
      setClientId(client.id);

      const res = await fetch(`/api/assessment?clientId=${client.id}`);
      const data = await res.json();

      setAssessmentId(data.assessmentId);
      const responseMap: ResponseMap = {};
      const notesMap: Record<string, string> = {};
      for (const r of data.responses) {
        responseMap[r.control_id] = r.response;
        if (r.notes) notesMap[r.control_id] = r.notes;
      }
      setResponses(responseMap);
      setNotes(notesMap);
      setLoaded(true);
    }
    init();
  }, []);

  const saveResponse = useCallback(async (controlId: string, response: Response, note: string) => {
    if (!assessmentId) return;
    setSaving(true);
    await fetch("/api/assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessmentId, controlId, response, notes: note }),
    });
    setSaving(false);
  }, [assessmentId]);

  const control = CONTROLS[step];
  const domain = getDomain(control.domain_code);
  const progress = ((step) / CONTROLS.length) * 100;
  const answeredCount = Object.keys(responses).length;
  const currentResponse = responses[control.id];
  const currentNote = notes[control.id] ?? "";

  function handleResponse(val: Response) {
    setResponses((r) => ({ ...r, [control.id]: val }));
    saveResponse(control.id, val, currentNote);
  }

  function handleNote(val: string) {
    setNotes((n) => ({ ...n, [control.id]: val }));
  }

  function handleNoteBlur() {
    if (currentResponse) {
      saveResponse(control.id, currentResponse, currentNote);
    }
  }

  if (!loaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Loading assessment...</div>
      </div>
    );
  }

  if (!clientId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>No Client Profile Found</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Contact Galaxy Consulting to set up your account.</div>
      </div>
    );
  }

  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Gap Assessment</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            NIST SP 800-171 Rev 2 — 110 Controls · {answeredCount} answered {saving && "· Saving..."}
          </div>
        </div>
        <a href="/portal/dashboard" style={{
          padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF",
          textDecoration: "none",
        }}>
          Save & Exit
        </a>
      </div>

      {/* Progress */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Progress</span>
          <span style={{ fontSize: 12, color: "#00C9FF", fontWeight: 600 }}>
            {step + 1} of {CONTROLS.length} ({Math.round(progress)}%)
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #00C9FF, #4DFFA0)", borderRadius: 3 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {DOMAINS.map((d) => (
            <span key={d.code} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 20, fontWeight: 600,
              background: d.code === control.domain_code ? `${d.color}22` : "rgba(255,255,255,0.04)",
              color: d.code === control.domain_code ? d.color : "rgba(255,255,255,0.3)",
              border: `1px solid ${d.code === control.domain_code ? d.color + "44" : "transparent"}`,
            }}>
              {d.code}
            </span>
          ))}
        </div>
      </div>

      {/* Control Card */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ background: `${domain?.color}22`, border: `1px solid ${domain?.color}44`, borderRadius: 8, padding: "4px 12px", fontSize: 12, color: domain?.color, fontWeight: 600 }}>
            {domain?.name}
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "4px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", fontFamily: "monospace" }}>
            {control.id}
          </div>
          <div style={{
            borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600,
            background: control.level === 1 ? "rgba(77,255,160,0.1)" : "rgba(0,201,255,0.1)",
            color: control.level === 1 ? "#4DFFA0" : "#00C9FF",
          }}>
            Level {control.level}
          </div>
        </div>

        <div style={{ fontSize: 16, color: "#fff", lineHeight: 1.6, marginBottom: 28, fontWeight: 500 }}>
          {control.description}
        </div>

        {/* Response buttons */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            Is this control implemented?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { val: "yes", label: "✅ Yes — Fully Implemented" },
              { val: "partial", label: "⚠️ Partial — In Progress" },
              { val: "no", label: "❌ No — Not Implemented" },
              { val: "na", label: "— N/A" },
            ] as { val: Response; label: string }[]).map((opt) => (
              <button key={opt.val} onClick={() => handleResponse(opt.val)} style={{
                flex: 1, padding: "10px 6px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: `1px solid ${currentResponse === opt.val ? "rgba(0,201,255,0.6)" : "rgba(255,255,255,0.1)"}`,
                background: currentResponse === opt.val ? "rgba(0,201,255,0.12)" : "rgba(255,255,255,0.03)",
                color: currentResponse === opt.val ? "#00C9FF" : "rgba(255,255,255,0.5)",
                transition: "all 0.15s",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>
            Notes / Evidence (optional)
          </div>
          <textarea
            value={currentNote}
            onChange={(e) => handleNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="Describe implementation details, link to evidence, or note remediation plans..."
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: 12, color: "#E2E8F0", fontSize: 13,
              resize: "vertical", minHeight: 80, boxSizing: "border-box",
            }}
          />
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: step === 0 ? "rgba(255,255,255,0.2)" : "#00C9FF",
              border: `1px solid ${step === 0 ? "rgba(255,255,255,0.1)" : "#00C9FF"}`,
            }}
          >
            ← Previous
          </button>
          <button
            onClick={() => {
              if (step < CONTROLS.length - 1) setStep((s) => s + 1);
              else window.location.href = "/portal/dashboard";
            }}
            style={{
              padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18", border: "none",
            }}
          >
            {step < CONTROLS.length - 1 ? "Next Control →" : "Complete & View Dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/portal/assessment/
git commit -m "feat: add client assessment page with auto-save"
```

---

## Task 14: Admin Layout & Dashboard

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/dashboard/page.tsx`

- [ ] **Step 1: Create admin layout**

Create `app/admin/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";

const ADMIN_NAV = [
  { id: "dashboard", href: "/admin/dashboard", icon: "⊞", label: "All Clients" },
  { id: "clients", href: "/admin/clients", icon: "◈", label: "Client Detail" },
  { id: "reports", href: "/admin/reports", icon: "▤", label: "Analytics" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const role = session.user.user_metadata?.role;
  if (role !== "admin") redirect("/portal/dashboard");

  const userName = session.user.user_metadata?.full_name || session.user.email || "Admin";

  return (
    <div style={{ display: "flex", background: "#050B18", minHeight: "100vh" }}>
      <Sidebar items={ADMIN_NAV} userName={userName} userRole="admin" />
      <main style={{ marginLeft: 240, padding: "32px 36px", flex: 1, color: "#E2E8F0" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create admin dashboard page**

Create `app/admin/dashboard/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = createServerSupabaseClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, company_name, contact_name, cmmc_target_level, engagement_stage, assessments(id, total_score, status)")
    .order("created_at", { ascending: false });

  const totalClients = clients?.length ?? 0;
  const activeEngagements = clients?.filter((c) => c.engagement_stage === "active").length ?? 0;
  const completed = clients?.filter((c) => c.engagement_stage === "completed").length ?? 0;
  const scores = clients?.flatMap((c) => c.assessments?.filter((a: { total_score: number | null }) => a.total_score !== null).map((a: { total_score: number }) => a.total_score) ?? []) ?? [];
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;

  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>Admin — Client Overview</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Galaxy Consulting, LLC · Internal Management Panel</div>
        </div>
        <Link href="/admin/clients/new" style={{
          padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg, #00C9FF, #4DFFA0)", color: "#050B18",
          textDecoration: "none",
        }}>
          + Invite Client
        </Link>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total Clients", value: String(totalClients), color: "#00C9FF" },
          { label: "Active Engagements", value: String(activeEngagements), color: "#4DFFA0" },
          { label: "Assessments Complete", value: String(completed), color: "#FFB347" },
          { label: "Avg. Score", value: `${avgScore}%`, color: "#F87171" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Client Pipeline */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Client Pipeline</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Company", "Contact", "CMMC Level", "Stage", "Score", "Action"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase", padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => {
              const latestAssessment = c.assessments?.[0];
              const score = latestAssessment?.total_score ?? null;
              const color = stageColor[c.engagement_stage] ?? "#888";
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 600, color: "#fff" }}>{c.company_name}</td>
                  <td style={{ padding: "12px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{c.contact_name}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 12, color: "#00C9FF", fontWeight: 600 }}>L{c.cmmc_target_level}</span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: `${color}18`, color, fontWeight: 600, textTransform: "capitalize" }}>
                      {c.engagement_stage}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    {score !== null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ height: 4, width: 60, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${score}%`, background: score > 70 ? "#4DFFA0" : score > 40 ? "#FFB347" : "#F87171", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{score}%</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Not started</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    <Link href={`/admin/clients/${c.id}`} style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: "rgba(0,201,255,0.1)", color: "#00C9FF",
                      border: "1px solid rgba(0,201,255,0.2)", textDecoration: "none",
                    }}>
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {(clients?.length ?? 0) === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", fontSize: 13, color: "rgba(255,255,255,0.3)" }}>
            No clients yet. Invite your first client to get started.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/
git commit -m "feat: add admin layout and client pipeline dashboard"
```

---

## Task 15: Admin Client Detail Page

**Files:**
- Create: `app/admin/clients/[id]/page.tsx`

- [ ] **Step 1: Create client detail page**

Create `app/admin/clients/[id]/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import { calculateScore, ResponseMap } from "@/lib/scoring";
import ScoreGauge from "@/components/ScoreGauge";
import DomainBar from "@/components/DomainBar";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!client) notFound();

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, status, started_at, completed_at")
    .eq("client_id", params.id)
    .order("started_at", { ascending: false });

  const activeAssessment = assessments?.find((a) => a.status === "in_progress") ?? assessments?.[0];

  let responses: ResponseMap = {};
  if (activeAssessment) {
    const { data: responseRows } = await supabase
      .from("assessment_responses")
      .select("control_id, response")
      .eq("assessment_id", activeAssessment.id);
    if (responseRows) {
      responses = Object.fromEntries(responseRows.map((r: { control_id: string; response: string }) => [r.control_id, r.response])) as ResponseMap;
    }
  }

  const score = calculateScore(responses);
  const card = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 };
  const stageColor: Record<string, string> = { lead: "#FFB347", active: "#00C9FF", completed: "#4DFFA0" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>{client.company_name}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
            {client.contact_name} · CMMC Level {client.cmmc_target_level} ·{" "}
            <span style={{ color: stageColor[client.engagement_stage], textTransform: "capitalize" }}>{client.engagement_stage}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Overall Score", value: `${score.overallScore}%`, color: score.overallScore >= 70 ? "#4DFFA0" : "#FFB347" },
          { label: "Gaps", value: String(score.gaps), color: "#F87171" },
          { label: "Passed", value: String(score.passed), color: "#4DFFA0" },
          { label: "Partial", value: String(score.partial), color: "#FFB347" },
        ].map((m, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Compliance Score</div>
          <ScoreGauge score={score.overallScore} size={140} />
        </div>
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Domain Breakdown</div>
          {score.domainScores.slice(0, 7).map((d) => (
            <DomainBar key={d.code} domainCode={d.code} score={d.score} />
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16 }}>Client Info</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { label: "Contact", value: client.contact_name },
            { label: "Phone", value: client.phone ?? "—" },
            { label: "Target Level", value: `CMMC Level ${client.cmmc_target_level}` },
            { label: "Stage", value: client.engagement_stage },
          ].map((f) => (
            <div key={f.label}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 14, color: "#E2E8F0", textTransform: "capitalize" }}>{f.value}</div>
            </div>
          ))}
        </div>
        {client.notes && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Notes</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>{client.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/admin/clients/
git commit -m "feat: add admin client detail page with assessment scores"
```

---

## Task 16: Portal Reports & Profile Stub Pages

**Files:**
- Create: `app/portal/reports/page.tsx`
- Create: `app/portal/profile/page.tsx`
- Create: `app/admin/reports/page.tsx`

- [ ] **Step 1: Create reports page**

Create `app/portal/reports/page.tsx`:

```tsx
export default function ReportsPage() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>📄</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>PDF Reports — Phase 4</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Report generation with @react-pdf/renderer is planned for Phase 4.</div>
      <a href="/portal/dashboard" style={{ padding: "11px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "transparent", color: "#00C9FF", border: "1px solid #00C9FF", textDecoration: "none" }}>← Back to Dashboard</a>
    </div>
  );
}
```

- [ ] **Step 2: Create profile page**

Create `app/portal/profile/page.tsx`:

```tsx
import { createServerSupabaseClient } from "@/lib/supabase-server";

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 24 }}>Profile</div>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>Email</div>
        <div style={{ fontSize: 14, color: "#E2E8F0", marginBottom: 16 }}>{session?.user.email}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Contact Galaxy Consulting to update account details.</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create admin reports stub**

Create `app/admin/reports/page.tsx`:

```tsx
export default function AdminReportsPage() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 40 }}>📊</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#fff" }}>Analytics — Phase 5</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Cross-client analytics and reporting planned for Phase 5.</div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/portal/reports/ app/portal/profile/ app/admin/reports/
git commit -m "feat: add reports, profile, and admin analytics stub pages"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Build check**

```bash
npm run build
```

Expected: No TypeScript errors. All 15+ pages compiled.

- [ ] **Step 2: Dev server smoke test**

```bash
npm run dev
```

Visit:
- `http://localhost:3000` → redirects to `/login`
- `/login` → login form renders
- After login as client → `/portal/dashboard`
- After login as admin → `/admin/dashboard`
- `/portal/assessment` → loads all 110 controls, saves on answer
- `/admin/dashboard` → shows client pipeline table

- [ ] **Step 3: Supabase checklist**
- [ ] Run migration SQL in Supabase SQL Editor
- [ ] Controls seeded (110 rows in `controls` table)
- [ ] Create first admin user via Supabase Auth Dashboard, set `user_metadata: { role: "admin", full_name: "Abdul Mirza" }`
- [ ] Create Supabase Storage bucket named `reports` (public: false)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete CMMC portal scaffold — all phases 1-3 implemented"
```

---

## Post-Scaffold: Remaining Phases

After this plan is complete, the following remain:

**Phase 4 — PDF Reports:**
- `components/pdf/ReportTemplate.tsx` using `@react-pdf/renderer`
- `app/api/reports/route.ts` — generate PDF, upload to Supabase Storage
- Replace `app/portal/reports/page.tsx` stub with download UI

**Phase 5 — Admin Enhancements:**
- `app/admin/clients/new/page.tsx` — client invite form
- Engagement stage update controls
- Analytics aggregations

---

*Plan Version: 1.0 | Galaxy CMMC Portal | Galaxy Consulting, LLC | Confidential*
