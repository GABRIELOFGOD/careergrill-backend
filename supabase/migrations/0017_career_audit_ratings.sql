alter table public.audit_records
  add column if not exists rating smallint check (rating between 1 and 5);
