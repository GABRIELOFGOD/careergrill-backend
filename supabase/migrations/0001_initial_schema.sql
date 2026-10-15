create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('job', 'scholarship', 'article', 'resource', 'service', 'faq', 'testimonial')),
  title text not null check (char_length(title) between 3 and 180),
  slug text not null unique,
  excerpt text not null default '',
  body text not null default '',
  category text not null default '',
  tags text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  expires_at timestamptz,
  source_url text check (source_url is null or source_url ~ '^https?://'),
  data jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_items_public_idx
  on public.content_items (type, published_at desc)
  where status = 'published';
create index if not exists content_items_expiry_idx
  on public.content_items (expires_at)
  where expires_at is not null;

create table if not exists public.saved_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  status text not null default 'saved' check (status in ('saved', 'preparing', 'submitted')),
  notes text not null default '' check (char_length(notes) <= 4000),
  reminder_enabled boolean not null default false,
  expires_at timestamptz,
  reminded_at timestamptz,
  reminder_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, content_id)
);
create index if not exists saved_content_reminders_idx
  on public.saved_content (expires_at)
  where reminder_enabled = true and reminded_at is null;

create or replace function public.sync_saved_content_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is distinct from old.expires_at then
    update public.saved_content
      set expires_at = new.expires_at, reminded_at = null, reminder_claimed_at = null, updated_at = now()
      where content_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists content_expiry_sync on public.content_items;
create trigger content_expiry_sync
  after update of expires_at on public.content_items
  for each row execute function public.sync_saved_content_expiry();

create or replace function public.claim_expiry_reminders()
returns table (saved_id uuid, expires_at timestamptz, email text, title text, slug text)
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select saved.id
    from public.saved_content as saved
    join public.users as account on account.id = saved.user_id
    join public.content_items as content on content.id = saved.content_id
    where saved.reminder_enabled = true
      and saved.reminded_at is null
      and account.email_verified_at is not null
      and saved.expires_at > now()
      and saved.expires_at <= now() + interval '3 days'
      and (saved.reminder_claimed_at is null or saved.reminder_claimed_at < now() - interval '30 minutes')
    order by saved.expires_at
    for update of saved skip locked
    limit 100
  ),
  claimed as (
    update public.saved_content as saved
    set reminder_claimed_at = now()
    from candidates
    where saved.id = candidates.id
    returning saved.id, saved.user_id, saved.content_id, saved.expires_at
  )
  select claimed.id, claimed.expires_at, account.email, content.title, content.slug
  from claimed
  join public.users as account on account.id = claimed.user_id
  join public.content_items as content on content.id = claimed.content_id;
$$;

create table if not exists public.email_verification_tokens (
  user_id uuid primary key references public.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null check (char_length(filename) between 1 and 180),
  mimetype text not null,
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  extracted_text text not null check (char_length(extracted_text) <= 120000),
  storage_provider text not null check (storage_provider in ('supabase', 'cloudinary')),
  storage_key text not null,
  uploaded_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 120),
  answers jsonb not null,
  feedback text not null check (char_length(feedback) between 1 and 12000),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists audit_records_user_idx
  on public.audit_records (user_id, created_at desc);

create table if not exists public.audit_daily_usage (
  user_id uuid not null references public.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count between 1 and 5),
  primary key (user_id, usage_date)
);

create or replace function public.reserve_audit_request(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.audit_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, current_date, 1)
  on conflict (user_id, usage_date)
  do update set request_count = public.audit_daily_usage.request_count + 1
  where public.audit_daily_usage.request_count < 5
  returning request_count;
$$;

create or replace function public.create_first_admin(
  p_name text,
  p_email text,
  p_password_hash text
)
returns table (id uuid, name text, email text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('careergrill-first-admin'));
  if exists (select 1 from public.users where users.role = 'admin') then
    raise exception 'BOOTSTRAP_COMPLETE';
  end if;
  return query
    insert into public.users (name, email, password_hash, role)
    values (p_name, lower(p_email), p_password_hash, 'admin')
    returning users.id, users.name, users.email, users.role;
end;
$$;

alter table public.users enable row level security;
alter table public.content_items enable row level security;
alter table public.saved_content enable row level security;
alter table public.email_verification_tokens enable row level security;
alter table public.ai_documents enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_records enable row level security;
alter table public.audit_daily_usage enable row level security;

drop policy if exists service_role_only on public.users;
create policy service_role_only on public.users
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.content_items;
create policy service_role_only on public.content_items
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.saved_content;
create policy service_role_only on public.saved_content
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.email_verification_tokens;
create policy service_role_only on public.email_verification_tokens
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.ai_documents;
create policy service_role_only on public.ai_documents
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.app_settings;
create policy service_role_only on public.app_settings
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.audit_records;
create policy service_role_only on public.audit_records
  for all to service_role using (true) with check (true);
drop policy if exists service_role_only on public.audit_daily_usage;
create policy service_role_only on public.audit_daily_usage
  for all to service_role using (true) with check (true);

revoke all on function public.reserve_audit_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_audit_request(uuid) to service_role;
revoke all on function public.create_first_admin(text, text, text) from public, anon, authenticated;
grant execute on function public.create_first_admin(text, text, text) to service_role;
revoke all on function public.claim_expiry_reminders() from public, anon, authenticated;
grant execute on function public.claim_expiry_reminders() to service_role;

insert into public.app_settings (key, value)
values ('storage_provider', '"supabase"'::jsonb)
on conflict (key) do nothing;

insert into public.content_items (type, title, slug, excerpt, body, category, tags, status, data)
values
  (
    'article',
    'How to explain programme fit without listing course names',
    'explain-programme-fit',
    'Turn programme research into a clear explanation of why the degree supports your plans.',
    '## Start with the question you want to answer\n\nName the skill, method or perspective you need. Then connect it to a specific part of the programme and explain how you will use it.\n\n## Make the connection visible\n\nAvoid repeating a course catalogue. Explain what you want to learn, why it matters to your next step and what experience has led you to that question.',
    'Graduate admissions',
    array['graduate admissions', 'statement of purpose'],
    'published',
    '{"reading_minutes": 4}'::jsonb
  ),
  (
    'article',
    'Check the funding gap before you commit to an application',
    'check-the-funding-gap',
    'An award label is a starting point. The terms tell you which costs remain your responsibility.',
    '## Separate the costs\n\nList tuition, living costs, travel, insurance and arrival costs separately. Compare each line with the award terms and confirm the current cycle with the official provider.\n\n## Keep the evidence\n\nSave the official source, the date you checked it and any questions that still need an answer.',
    'Scholarships',
    array['scholarships', 'funding'],
    'published',
    '{"reading_minutes": 3}'::jsonb
  ),
  (
    'resource',
    'Before you send your SOP for review',
    'sop-review-checklist',
    'Check the prompt, programme fit and evidence in your draft before asking for feedback.',
    '## Checklist\n\n- I have answered the actual prompt.\n- I can connect my experience to the programme.\n- I have checked names, dates and requirements against official sources.\n- My examples explain what I did and what changed.\n- The draft still sounds like me.',
    'Graduate admissions',
    array['checklist', 'statement of purpose'],
    'published',
    '{"format":"Checklist"}'::jsonb
  ),
  (
    'resource',
    'Turn your work into CV evidence',
    'turn-work-into-cv-evidence',
    'Find your contribution in everyday work and explain what changed because of it.',
    '## Think through one example\n\n1. What task or problem needed attention?\n2. What did you decide or do?\n3. Who or what was affected?\n4. What changed, and how do you know?\n\nWrite a specific example before turning it into a CV bullet.',
    'Career documents',
    array['worksheet', 'CV'],
    'published',
    '{"format":"Worksheet"}'::jsonb
  )
on conflict (slug) do nothing;
