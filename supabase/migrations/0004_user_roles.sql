alter table public.users
  add column if not exists role text;

update public.users
set role = 'user'
where role is null;

alter table public.users
  alter column role set default 'user',
  alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_role_valid'
  ) then
    alter table public.users
      add constraint users_role_valid check (role in ('admin', 'user'));
  end if;
end;
$$;
