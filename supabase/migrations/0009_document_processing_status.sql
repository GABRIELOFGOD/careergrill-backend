alter table public.ai_documents
  add column if not exists processing_status text not null default 'ready'
  check (processing_status in ('processing', 'ready', 'failed'));

create index if not exists ai_documents_processing_status_idx
  on public.ai_documents (processing_status, created_at desc);
