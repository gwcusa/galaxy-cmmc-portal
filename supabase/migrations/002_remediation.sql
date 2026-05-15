-- Add guidance column to controls
alter table controls add column if not exists guidance text;

-- Remediation notes table (Galaxy staff annotate client gaps)
create table if not exists remediation_notes (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  control_id varchar references controls(id),
  custom_guidance text,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(assessment_id, control_id)
);

-- RLS
alter table remediation_notes enable row level security;

-- Admins can read/write all notes
create policy "remediation_admin_all" on remediation_notes
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Clients can read only their own APPROVED notes
create policy "remediation_client_read_approved" on remediation_notes
  for select using (
    status = 'approved' and
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = remediation_notes.assessment_id
      and c.user_id = auth.uid()
    )
  );
