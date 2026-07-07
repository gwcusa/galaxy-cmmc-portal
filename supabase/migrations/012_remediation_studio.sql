-- Phase 4: Remediation studio
--
-- 1. AI-generated intake questions ride on information_requests:
--    request_type 'ai_intake' + structured questions/answers JSON, optionally
--    tied to a specific control.
-- 2. generated_artifacts gains versioning, a config_baseline type, per-control
--    artifacts, and a 'published' status that clients can read.

alter table information_requests
  add column if not exists request_type text not null default 'manual',
  add column if not exists control_id varchar references controls(id),
  add column if not exists questions jsonb,
  add column if not exists answers jsonb;

alter table information_requests
  drop constraint if exists information_requests_request_type_check;
alter table information_requests
  add constraint information_requests_request_type_check
  check (request_type in ('manual', 'ai_intake'));

alter table generated_artifacts
  add column if not exists control_id varchar references controls(id),
  add column if not exists version integer not null default 1;

alter table generated_artifacts
  drop constraint if exists generated_artifacts_artifact_type_check;
alter table generated_artifacts
  add constraint generated_artifacts_artifact_type_check
  check (artifact_type in ('ssp', 'poam', 'policy_template', 'config_baseline'));

alter table generated_artifacts
  drop constraint if exists generated_artifacts_status_check;
alter table generated_artifacts
  add constraint generated_artifacts_status_check
  check (status in ('draft', 'finalized', 'published'));

-- Clients may read artifacts once published to them
create policy "gen_artifacts_client_published" on generated_artifacts
  for select using (
    status = 'published'
    and exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = generated_artifacts.assessment_id
        and c.user_id = auth.uid()
    )
  );
