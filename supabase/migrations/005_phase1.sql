-- Phase 1: Engagement types, assessment lifecycle states, CMMC-aligned verdict names

-- 1. Add engagement_type to clients
--    'assessment'  = Assessment Only package
--    'remediation' = Remediation Package (includes artifact gen + info requests)
alter table clients
  add column if not exists engagement_type text not null default 'assessment'
  check (engagement_type in ('assessment', 'remediation'));

-- 2. Migrate legacy 'completed' status and extend lifecycle
update assessments set status = 'finalized' where status = 'completed';

alter table assessments drop constraint if exists assessments_status_check;
alter table assessments add constraint assessments_status_check
  check (status in (
    'in_progress',
    'submitted',
    'under_review',
    'remediation_required',
    'resubmitted',
    'approved',
    'finalized',
    'archived'
  ));

-- 3. Rename AI verdict values to CMMC-standard terminology
--    Drop old constraint first so the renames aren't blocked
alter table control_ai_feedback drop constraint if exists control_ai_feedback_verdict_check;

update control_ai_feedback set verdict = 'met'           where verdict = 'sufficient';
update control_ai_feedback set verdict = 'partially_met' where verdict = 'needs_more';
update control_ai_feedback set verdict = 'not_met'       where verdict = 'insufficient';

alter table control_ai_feedback add constraint control_ai_feedback_verdict_check
  check (verdict in ('met', 'partially_met', 'not_met', 'needs_review'));

-- 4. Remove client read access to AI feedback — assessor-only data
drop policy if exists "ai_feedback_client_read" on control_ai_feedback;
