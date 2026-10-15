alter table public.users
  alter column password_hash drop not null;

alter table public.users
  add column if not exists google_sub text;

create unique index if not exists users_google_sub_unique
  on public.users (google_sub)
  where google_sub is not null;
