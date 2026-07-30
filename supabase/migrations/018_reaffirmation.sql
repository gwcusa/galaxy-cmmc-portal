-- Phase 6: Annual re-affirmation tracking
--
-- CMMC requires an annual affirmation of continued compliance. When an
-- assessment is finalized, its clock starts; ~11 months later the client is
-- reminded to re-affirm. reaffirmation_reminded_at makes the daily cron
-- idempotent so a client is reminded at most once per cycle.
alter table assessments
  add column if not exists reaffirmation_reminded_at timestamptz;
