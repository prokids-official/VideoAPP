alter table public.assets
  add column idempotency_key text;

create index idx_assets_idempotency_key
  on public.assets(idempotency_key)
  where idempotency_key is not null;
