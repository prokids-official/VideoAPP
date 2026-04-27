create table public.push_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  result_json jsonb not null,
  status text not null check (status in ('success', 'dead_letter')),
  completed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create unique index idx_push_idempotency_key_user
  on public.push_idempotency(idempotency_key, user_id);

create index idx_push_idempotency_expires
  on public.push_idempotency(expires_at);

alter table public.push_idempotency enable row level security;

create table public.r2_orphans (
  id uuid primary key default gen_random_uuid(),
  storage_ref text not null,
  bytes bigint,
  reason text,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz
);

create index idx_r2_orphans_pending
  on public.r2_orphans(created_at) where cleaned_at is null;

alter table public.r2_orphans enable row level security;
