-- Track staff (admin/assessor) report downloads separately from the client's own.
-- downloaded_at keeps its original meaning: the client viewed/downloaded their report.
alter table reports add column if not exists staff_downloaded_at timestamptz;
alter table reports add column if not exists staff_downloaded_by uuid references auth.users(id);
