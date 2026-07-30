-- Phase 6: Per-objective assessor determinations
--
-- A CMMC requirement is MET only if every NIST SP 800-171A assessment objective
-- is met. The AI already evaluates each objective (control_ai_feedback.
-- objective_results); this lets the human assessor record a verdict per
-- objective too. objective_verdicts is a map of objective id -> verdict:
--   { "3.1.1[a]": "met", "3.1.1[b]": "not_met", "3.1.1[c]": "unclear" }
-- The control-level assessor_verdict remains the authoritative roll-up.
alter table assessor_determinations
  add column if not exists objective_verdicts jsonb;
