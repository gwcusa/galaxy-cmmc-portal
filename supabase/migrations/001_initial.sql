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
  id varchar primary key,
  domain text not null,
  domain_code varchar(2) not null,
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

-- User roles (mirrored for easy querying)
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
