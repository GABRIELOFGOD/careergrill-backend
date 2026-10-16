alter table public.jobs add column if not exists deleted_at timestamptz;
alter table public.scholarships add column if not exists deleted_at timestamptz;
alter table public.blog_posts add column if not exists deleted_at timestamptz;
alter table public.resources add column if not exists deleted_at timestamptz;
alter table public.services add column if not exists deleted_at timestamptz;
alter table public.faqs add column if not exists deleted_at timestamptz;
alter table public.feedback add column if not exists deleted_at timestamptz;

create index if not exists jobs_deleted_at_idx on public.jobs (deleted_at) where deleted_at is not null;
create index if not exists scholarships_deleted_at_idx on public.scholarships (deleted_at) where deleted_at is not null;
create index if not exists blog_posts_deleted_at_idx on public.blog_posts (deleted_at) where deleted_at is not null;
create index if not exists resources_deleted_at_idx on public.resources (deleted_at) where deleted_at is not null;
create index if not exists services_deleted_at_idx on public.services (deleted_at) where deleted_at is not null;
create index if not exists faqs_deleted_at_idx on public.faqs (deleted_at) where deleted_at is not null;
create index if not exists feedback_deleted_at_idx on public.feedback (deleted_at) where deleted_at is not null;

create or replace function public.claim_expiry_reminders()
returns table (saved_id uuid, expires_at timestamptz, email text, title text, slug text)
language sql
security definer
set search_path = public
as $$
  with content_rows as (
    select 'job'::text as content_type, id, title, slug from public.jobs where deleted_at is null
    union all select 'scholarship', id, title, slug from public.scholarships where deleted_at is null
    union all select 'article', id, title, slug from public.blog_posts where deleted_at is null
    union all select 'resource', id, title, slug from public.resources where deleted_at is null
    union all select 'service', id, title, slug from public.services where deleted_at is null
    union all select 'faq', id, title, slug from public.faqs where deleted_at is null
    union all select 'testimonial', id, title, slug from public.feedback where deleted_at is null
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
