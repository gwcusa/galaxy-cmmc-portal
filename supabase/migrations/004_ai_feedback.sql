create table if not exists control_ai_feedback (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid references assessments(id) on delete cascade,
  control_id varchar references controls(id),
  feedback text not null,
  verdict text not null check (verdict in ('sufficient', 'needs_more', 'insufficient')),
  generated_at timestamptz default now(),
  unique(assessment_id, control_id)
);

alter table control_ai_feedback enable row level security;

create policy "ai_feedback_client_read" on control_ai_feedback
  for select using (
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = control_ai_feedback.assessment_id
      and c.user_id = auth.uid()
    )
  );

create policy "ai_feedback_admin_read" on control_ai_feedback
  for select using (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );
