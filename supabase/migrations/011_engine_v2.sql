-- Phase 3: Assessment engine v2 — per-objective results, tracked AI runs,
-- engagement-level synthesis.

-- Per-objective evaluation results (NIST SP 800-171A) alongside the verdict
alter table control_ai_feedback
  add column if not exists objective_results jsonb;

-- Tracked AI review runs: progress, retries, and completion state
create table if not exists ai_review_runs (
  id uuid primary key default uuid_generate_v4(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  total_controls integer not null default 0,
  completed_controls integer not null default 0,
  failed_controls integer not null default 0,
  synthesis_done boolean not null default false,
  error text,
  started_by uuid references auth.users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_ai_runs_assessment on ai_review_runs (assessment_id, started_at desc);

alter table ai_review_runs enable row level security;

-- Assessor-only (clients never see AI internals)
create policy "ai_runs_admin_all" on ai_review_runs
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

-- Engagement-level synthesis: the "does this client meet CMMC, why/why not" answer
create table if not exists assessment_summaries (
  assessment_id uuid primary key references assessments(id) on delete cascade,
  overall_verdict text not null
    check (overall_verdict in ('ready', 'conditional', 'not_ready')),
  narrative text not null,
  sprs_estimate integer,
  poam_eligible boolean,
  domain_rollups jsonb,
  top_blockers jsonb,
  contradictions jsonb,
  generated_at timestamptz not null default now()
);

alter table assessment_summaries enable row level security;

create policy "summaries_admin_all" on assessment_summaries
  for all using (
    exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );
