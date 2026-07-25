-- Split evidence into policy documents and implementation artifacts
-- Each CMMC control now requires two distinct evidence types with separate "not available" flags

ALTER TABLE artifacts
  ADD COLUMN artifact_type TEXT CHECK (artifact_type IN ('policy', 'implementation'));

ALTER TABLE assessment_responses
  ADD COLUMN no_policy_document BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN no_implementation_artifact BOOLEAN NOT NULL DEFAULT FALSE;
