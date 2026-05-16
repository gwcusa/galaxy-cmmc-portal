-- Artifacts table: evidence files uploaded by clients per control
create table if not exists artifacts (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  control_id varchar references controls(id),
  file_name text not null,
  storage_path text not null,
  file_size integer,
  mime_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz default now()
);

-- RLS
alter table artifacts enable row level security;

-- Clients: full access to their own artifacts
create policy "artifacts_client_own" on artifacts
  for all using (
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = artifacts.assessment_id
      and c.user_id = auth.uid()
    )
  );

-- Admins: read all artifacts
create policy "artifacts_admin_read" on artifacts
  for select using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
