-- Phase 5: Remediation automation (one-click package)
--
-- 1. A single consolidated intake questionnaire covering every gap at once
--    rides on information_requests with request_type 'ai_intake_package'.
--    Each question in the JSON carries a `controls` array (which gaps it feeds).
-- 2. New 'responsibility_matrix' artifact type (Customer/Shared Responsibility
--    Matrix — who owns each control: client / MSP / cloud provider / shared).
-- 3. generated_artifacts.covers_controls records which controls an artifact
--    addresses — powers the gap→deliverable traceability view and lets a
--    published policy be turned back into mapped evidence (close-the-loop).
-- 4. documents gains provenance so auto-generated evidence is traceable and
--    idempotent (never double-created when an artifact is re-published).

alter table information_requests
  drop constraint if exists information_requests_request_type_check;
alter table information_requests
  add constraint information_requests_request_type_check
  check (request_type in ('manual', 'ai_intake', 'ai_intake_package'));

alter table generated_artifacts
  add column if not exists covers_controls jsonb;

alter table generated_artifacts
  drop constraint if exists generated_artifacts_artifact_type_check;
alter table generated_artifacts
  add constraint generated_artifacts_artifact_type_check
  check (artifact_type in ('ssp', 'poam', 'policy_template', 'config_baseline', 'responsibility_matrix'));

alter table documents
  add column if not exists source text not null default 'upload'
    check (source in ('upload', 'generated')),
  add column if not exists source_artifact_id uuid references generated_artifacts(id) on delete set null;

create index if not exists idx_documents_source_artifact on documents (source_artifact_id);
