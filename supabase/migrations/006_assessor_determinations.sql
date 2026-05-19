-- Assessor determinations: formal human verdict per control, separate from AI recommendation

create table if not exists assessor_determinations (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  control_id varchar references controls(id),
  -- Snapshot of AI recommendation at time of review (for audit trail)
  ai_verdict text,
  ai_feedback text,
  -- Assessor's formal determination
  assessor_verdict text not null check (assessor_verdict in ('met', 'partially_met', 'not_met', 'needs_review')),
  assessor_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(assessment_id, control_id)
);

alter table assessor_determinations enable row level security;

-- Assessors (admins) can read and write all determinations
create policy "determinations_admin_all" on assessor_determinations
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Clients cannot see assessor determinations
