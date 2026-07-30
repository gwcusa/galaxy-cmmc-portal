-- Phase 6: Evidence integrity
--
-- Store a SHA-256 of every uploaded evidence file so the assessment record is
-- tamper-evident: the hash is captured at upload time and recorded in the audit
-- log, letting an assessor prove a policy/proof file was not altered after
-- submission. Backfilled as null for pre-existing rows.
alter table artifacts add column if not exists sha256 text;
alter table documents add column if not exists sha256 text;
