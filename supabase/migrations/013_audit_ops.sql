-- Phase 5: Audit trail + assessor assignment

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on audit_log (entity_type, entity_id);
create index if not exists idx_audit_log_created on audit_log (created_at desc);

alter table audit_log enable row level security;

-- Read-only for assessors; all writes happen via the service role
create policy "audit_log_admin_read" on audit_log
  for select using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Multi-assessor: which assessor owns this engagement
alter table assessments
  add column if not exists assigned_to uuid references auth.users(id);
