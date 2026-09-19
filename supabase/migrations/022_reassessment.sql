-- Reassessment cycles: an admin/assessor can start a new assessment cycle for
-- a client whose prior assessment is finalized, carrying forward the client's
-- previous control responses so only changed controls need to be touched.
alter table assessments
  add column if not exists previous_assessment_id uuid references assessments(id);
