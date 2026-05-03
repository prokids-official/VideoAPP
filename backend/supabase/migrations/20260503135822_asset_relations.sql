alter type asset_source add value if not exists 'studio-export';

create type asset_relation_type as enum (
  'generated_from_prompt',
  'derived_from_storyboard'
);

create table public.asset_relations (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_asset_id uuid not null references public.assets(id) on delete cascade,
  target_asset_id uuid not null references public.assets(id) on delete cascade,
  relation_type asset_relation_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint asset_relations_not_self check (source_asset_id <> target_asset_id),
  constraint asset_relations_unique unique (source_asset_id, target_asset_id, relation_type)
);

create index asset_relations_episode_idx
  on public.asset_relations(episode_id, relation_type);

create index asset_relations_source_idx
  on public.asset_relations(source_asset_id, relation_type);

create index asset_relations_target_idx
  on public.asset_relations(target_asset_id, relation_type);

alter table public.asset_relations enable row level security;

create policy asset_relations_select_visible on public.asset_relations
  for select to authenticated
  using (
    exists (
      select 1 from public.assets source_asset
      where source_asset.id = source_asset_id
        and (source_asset.status = 'pushed' or source_asset.author_id = auth.uid())
        and source_asset.withdrawn_at is null
    )
    and exists (
      select 1 from public.assets target_asset
      where target_asset.id = target_asset_id
        and (target_asset.status = 'pushed' or target_asset.author_id = auth.uid())
        and target_asset.withdrawn_at is null
    )
  );

create policy asset_relations_no_direct_insert on public.asset_relations
  for insert to authenticated
  with check (false);

create policy asset_relations_no_direct_update on public.asset_relations
  for update to authenticated
  using (false);

create policy asset_relations_no_delete on public.asset_relations
  for delete to authenticated
  using (false);
