alter table public.users
  drop constraint if exists users_email_check;

create table public.email_whitelist (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  reason text,
  added_by uuid not null references public.users(id),
  added_at timestamptz not null default now(),
  revoked_by uuid references public.users(id),
  revoked_at timestamptz,
  constraint email_whitelist_domain_format
    check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);

create unique index email_whitelist_active_unique
  on public.email_whitelist(domain) where revoked_at is null;

create index email_whitelist_active_idx
  on public.email_whitelist(domain) where revoked_at is null;

alter table public.email_whitelist enable row level security;

create policy email_whitelist_admin_select on public.email_whitelist
  for select to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

create policy email_whitelist_admin_insert on public.email_whitelist
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );

create policy email_whitelist_admin_update on public.email_whitelist
  for update to authenticated
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid() and users.role = 'admin'
    )
  );
