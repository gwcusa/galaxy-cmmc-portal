-- Phase 2: Client document library + assessment scoping profile
--
-- Documents are uploaded once per client and mapped many-to-many onto controls
-- (a single Access Control Policy typically evidences a dozen requirements).
-- Mappings can be AI-suggested (status 'suggested') and confirmed by the client
-- or assessor. The AI evidence review reads confirmed documents for each control
-- alongside per-control artifacts.

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete cascade,
  file_name text not null,
  title text,
  doc_type text check (doc_type in ('policy', 'procedure', 'plan', 'diagram', 'config', 'log', 'report', 'other')),
  storage_path text not null,
  file_size bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create table if not exists document_control_links (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references documents(id) on delete cascade,
  control_id varchar not null references controls(id),
  status text not null default 'suggested' check (status in ('suggested', 'confirmed', 'rejected')),
  source text not null default 'ai' check (source in ('ai', 'client', 'assessor')),
  confidence numeric,
  rationale text,
  created_at timestamptz not null default now(),
  unique (document_id, control_id)
);

create index if not exists idx_doc_links_control on document_control_links (control_id);
create index if not exists idx_documents_client on documents (client_id);

-- Scoping profile: environment context captured before the questionnaire.
-- Feeds every AI review so verdicts account for the client's actual environment.
create table if not exists assessment_scoping (
  assessment_id uuid primary key references assessments(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table documents enable row level security;
alter table document_control_links enable row level security;
alter table assessment_scoping enable row level security;

create policy "documents_client_or_admin" on documents
  for all using (
    exists (
      select 1 from clients c
      where c.id = documents.client_id and c.user_id = auth.uid()
    )
    or exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
  );

create policy "doc_links_via_document" on document_control_links
  for all using (
    exists (
      select 1 from documents d
      join clients c on c.id = d.client_id
      where d.id = document_control_links.document_id
        and (
          c.user_id = auth.uid()
          or exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
        )
    )
  );

create policy "scoping_via_assessment" on assessment_scoping
  for all using (
    exists (
      select 1 from assessments a
      join clients c on c.id = a.client_id
      where a.id = assessment_scoping.assessment_id
        and (
          c.user_id = auth.uid()
          or exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin')
        )
    )
  );
