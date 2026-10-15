create table if not exists public.jobs (
  like public.content_items including defaults including constraints including indexes
);
alter table public.jobs drop column if exists type;

create table if not exists public.scholarships (
  like public.content_items including defaults including constraints including indexes
);
alter table public.scholarships drop column if exists type;

create table if not exists public.blog_posts (
  like public.content_items including defaults including constraints including indexes
);
alter table public.blog_posts drop column if exists type;

create table if not exists public.resources (
  like public.content_items including defaults including constraints including indexes
);
alter table public.resources drop column if exists type;

create table if not exists public.services (
  like public.content_items including defaults including constraints including indexes
);
alter table public.services drop column if exists type;

create table if not exists public.faqs (
  like public.content_items including defaults including constraints including indexes
);
alter table public.faqs drop column if exists type;

create table if not exists public.feedback (
  like public.content_items including defaults including constraints including indexes
);
alter table public.feedback drop column if exists type;

insert into public.jobs (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'job';

insert into public.scholarships (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'scholarship';

insert into public.blog_posts (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'article';

insert into public.resources (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'resource';

insert into public.services (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'service';

insert into public.faqs (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'faq';

insert into public.feedback (id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at)
select id, title, slug, excerpt, body, category, tags, status, expires_at, source_url, data, published_at, created_at, updated_at
from public.content_items where type = 'testimonial';

alter table public.saved_content add column if not exists content_type text;
update public.saved_content as saved
set content_type = content.type
from public.content_items as content
where content.id = saved.content_id and saved.content_type is null;

do $$
declare
  foreign_key_name text;
begin
  for foreign_key_name in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.saved_content'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.content_items'::regclass
  loop
    execute format('alter table public.saved_content drop constraint %I', foreign_key_name);
  end loop;
end;
$$;

alter table public.saved_content alter column content_type set not null;
alter table public.saved_content
  add constraint saved_content_type_valid
  check (content_type in ('job', 'scholarship', 'article', 'resource', 'service', 'faq', 'testimonial'));
alter table public.saved_content drop constraint if exists saved_content_user_id_content_id_key;
alter table public.saved_content
  add constraint saved_content_user_type_content_unique unique (user_id, content_type, content_id);
create index if not exists saved_content_reminders_idx
  on public.saved_content (expires_at)
  where reminder_enabled = true and reminded_at is null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['jobs', 'scholarships', 'blog_posts', 'resources', 'services', 'faqs', 'feedback']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
    execute format(
      'create policy service_role_only on public.%I for all to service_role using (true) with check (true)',
      table_name
    );
    execute format(
      'create index %I on public.%I (published_at desc) where status = %L',
      table_name || '_public_idx', table_name, 'published'
    );
  end loop;
end;
$$;

drop trigger if exists content_expiry_sync on public.content_items;
drop function if exists public.sync_saved_content_expiry();

create or replace function public.sync_saved_content_expiry()
returns trigger
language plpgsql
as $$
begin
  if new.expires_at is distinct from old.expires_at then
    update public.saved_content
      set expires_at = new.expires_at,
          reminded_at = null,
          reminder_claimed_at = null,
          updated_at = now()
      where content_id = new.id and content_type = tg_argv[0];
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
  content_type text;
begin
  for table_name, content_type in
    select * from (values
      ('jobs', 'job'),
      ('scholarships', 'scholarship'),
      ('blog_posts', 'article'),
      ('resources', 'resource'),
      ('services', 'service'),
      ('faqs', 'faq'),
      ('feedback', 'testimonial')
    ) as content_tables(table_name, content_type)
  loop
    execute format(
      'create trigger %I after update of expires_at on public.%I for each row execute function public.sync_saved_content_expiry(%L)',
      table_name || '_expiry_sync', table_name, content_type
    );
  end loop;
end;
$$;

create or replace function public.claim_expiry_reminders()
returns table (saved_id uuid, expires_at timestamptz, email text, title text, slug text)
language sql
security definer
set search_path = public
as $$
  with content_rows as (
    select 'job'::text as content_type, id, title, slug from public.jobs
    union all select 'scholarship', id, title, slug from public.scholarships
    union all select 'article', id, title, slug from public.blog_posts
    union all select 'resource', id, title, slug from public.resources
    union all select 'service', id, title, slug from public.services
    union all select 'faq', id, title, slug from public.faqs
    union all select 'testimonial', id, title, slug from public.feedback
  ),
  candidates as (
    select saved.id, saved.user_id, saved.content_id, saved.content_type, saved.expires_at,
      content.title, content.slug
    from public.saved_content as saved
    join public.users as account on account.id = saved.user_id
    join content_rows as content
      on content.id = saved.content_id and content.content_type = saved.content_type
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
    returning saved.id, saved.expires_at, saved.user_id, saved.content_id, saved.content_type
  )
  select claimed.id, claimed.expires_at, account.email, candidates.title, candidates.slug
  from claimed
  join candidates on candidates.id = claimed.id
  join public.users as account on account.id = claimed.user_id;
$$;

grant execute on function public.claim_expiry_reminders() to service_role;

drop table public.content_items;
