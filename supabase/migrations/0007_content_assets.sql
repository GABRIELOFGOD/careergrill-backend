create table if not exists public.content_assets (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null check (storage_provider in ('supabase', 'cloudinary')),
  storage_key text not null,
  filename text not null check (char_length(filename) between 1 and 180),
  mimetype text not null check (mimetype in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists content_assets_created_at_idx
  on public.content_assets (created_at desc);

alter table public.content_assets enable row level security;
grant all privileges on table public.content_assets to service_role;
create policy service_role_only on public.content_assets
  for all to service_role using (true) with check (true);
