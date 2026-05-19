-- Phase 3: Information requests (bidirectional) + AI-generated compliance artifacts

-- ---------------------------------------------------------------------------
-- Information requests: assessor → client, client responds
-- ---------------------------------------------------------------------------
create table if not exists information_requests (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending', 'responded', 'closed')),
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  client_response text,
  responded_at timestamptz
);

alter table information_requests enable row level security;

-- Assessors (admins) can read and write all requests
create policy "info_req_admin_all" on information_requests
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Clients can read requests linked to their own assessments
create policy "info_req_client_select" on information_requests
  for select using (
    exists (
      select 1 from assessments a
      inner join clients c on c.id = a.client_id
      where a.id = information_requests.assessment_id
        and c.user_id = auth.uid()
    )
  );

-- Clients can update (respond) to pending requests on their own assessments
create policy "info_req_client_respond" on information_requests
  for update using (
    status = 'pending'
    and exists (
      select 1 from assessments a
      inner join clients c on c.id = a.client_id
      where a.id = information_requests.assessment_id
        and c.user_id = auth.uid()
    )
  )
  with check (status = 'responded');

-- ---------------------------------------------------------------------------
-- Generated compliance artifacts: SSP, POA&M, Policy Templates
-- ---------------------------------------------------------------------------
create table if not exists generated_artifacts (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  artifact_type text not null
    check (artifact_type in ('ssp', 'poam', 'policy_template')),
  title text not null,
  content text not null,
  status text not null default 'draft'
    check (status in ('draft', 'finalized')),
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table generated_artifacts enable row level security;

-- Assessors can read and write all generated artifacts
create policy "gen_artifacts_admin_all" on generated_artifacts
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Clients cannot see internal generated artifacts
