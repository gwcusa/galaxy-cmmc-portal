-- Add unique constraint on reports.assessment_id so upsert onConflict works.
-- Idempotent: safe to run whether or not the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_assessment_id_key'
  ) then
    alter table reports add constraint reports_assessment_id_key unique (assessment_id);
  end if;
end $$;
