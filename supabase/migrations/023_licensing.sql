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

-- One live successor cycle per assessment: prevents two concurrent start-cycle
-- calls opening duplicate cycles. The app has always enforced one successor in
-- lib/reassessment.ts (only the client's latest non-archived cycle can be
-- reassessed), so existing data cannot violate this. Archived successors are
-- excluded: if a successor is archived, its predecessor becomes the latest
-- non-archived cycle again and may legitimately be reassessed a second time.
create unique index if not exists assessments_one_successor
  on assessments (previous_assessment_id)
  where previous_assessment_id is not null and status <> 'archived';

-- At most one live Single license per client (FR-LC-04), enforced even under concurrent assigns.
create unique index if not exists client_licenses_one_single
  on client_licenses (client_id)
  where type = 'single' and voided_at is null;

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
