create table public.pushes (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  idempotency_key text not null,
  commit_message text not null,
  github_commit_sha text,
  github_revert_sha text,
  github_revert_failed boolean not null default false,
  github_revert_error text,
  pushed_by uuid not null references public.users(id),
  pushed_at timestamptz not null default now(),
  asset_count int not null,
  total_bytes bigint not null,
  withdrawn_by uuid references public.users(id),
  withdrawn_at timestamptz,
  withdrawn_reason text,
  constraint pushes_idem_unique unique (pushed_by, idempotency_key)
);

create index pushes_episode_pushed_at_idx
  on public.pushes(episode_id, pushed_at desc);

create index pushes_active_idx
  on public.pushes(episode_id) where withdrawn_at is null;

alter table public.pushes enable row level security;

create policy pushes_select_all on public.pushes
  for select to authenticated
  using (auth.uid() is not null);

create policy pushes_no_direct_insert on public.pushes
  for insert to authenticated
  with check (false);

create policy pushes_no_direct_update on public.pushes
  for update to authenticated
  using (false);

create policy pushes_no_delete on public.pushes
  for delete to authenticated
  using (false);

alter table public.assets
  add column push_id uuid references public.pushes(id) on delete restrict,
  add column withdrawn_at timestamptz;

create index assets_push_id_idx on public.assets(push_id);

create index assets_active_idx
  on public.assets(episode_id, type_code) where withdrawn_at is null;

insert into public.pushes (
  idempotency_key,
  commit_message,
  pushed_by,
  pushed_at,
  episode_id,
  asset_count,
  total_bytes,
  github_commit_sha
)
select
  coalesce(a.idempotency_key, 'legacy-' || a.id::text) as idempotency_key,
  '(legacy import)' as commit_message,
  a.author_id as pushed_by,
  min(a.pushed_at) as pushed_at,
  a.episode_id,
  count(*)::int as asset_count,
  sum(coalesce(a.file_size_bytes, 0)) as total_bytes,
  null as github_commit_sha
from public.assets a
where a.push_id is null
group by
  coalesce(a.idempotency_key, 'legacy-' || a.id::text),
  a.author_id,
  a.episode_id;

update public.assets a
set push_id = p.id
from public.pushes p
where a.push_id is null
  and a.author_id = p.pushed_by
  and a.episode_id = p.episode_id
  and coalesce(a.idempotency_key, 'legacy-' || a.id::text) = p.idempotency_key;
