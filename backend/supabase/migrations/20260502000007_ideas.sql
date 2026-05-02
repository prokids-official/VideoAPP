create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.users(id) on delete restrict,
  title text not null check (length(title) between 1 and 120),
  description text not null check (length(description) between 1 and 4000),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'shipped')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id),
  status_changed_at timestamptz,
  status_changed_by uuid references public.users(id)
);

create index ideas_recent_idx
  on public.ideas (created_at desc)
  where deleted_at is null;

create index ideas_status_idx
  on public.ideas (status, created_at desc)
  where deleted_at is null;

create index ideas_author_idx
  on public.ideas (author_id, created_at desc)
  where deleted_at is null;

create table public.idea_references (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  source text not null check (source in ('douyin', 'bilibili', 'youtube', 'article', 'other')),
  url text not null,
  title text,
  thumbnail_url text,
  added_by text not null check (added_by in ('user', 'agent')),
  added_at timestamptz not null default now()
);

create index idea_references_by_idea
  on public.idea_references (idea_id);

alter table public.ideas enable row level security;
alter table public.idea_references enable row level security;

create policy ideas_read_all on public.ideas
  for select to authenticated
  using (deleted_at is null);

create policy ideas_insert_own on public.ideas
  for insert to authenticated
  with check (auth.uid() = author_id);

create policy ideas_update_own_or_admin on public.ideas
  for update to authenticated
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    auth.uid() = author_id
    or exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy refs_read_all on public.idea_references
  for select to authenticated
  using (true);
