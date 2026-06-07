-- ============================================================================
-- M1 — Wearable pipe migration
-- Chronic Health Tracker (pre-diabetes / metabolic MVP)
--
-- Adds the storage for cloud-wearable OAuth connections and the normalized
-- wearable samples that flow in from them (M1 starts with Whoop). Wearable
-- samples ARE health data (PHI): reads are gated by `wearable_sync` consent
-- and audited, and RLS restricts every row to its owner.
--
-- OAuth tokens are encrypted by the application (Fernet) BEFORE they reach the
-- DB; the columns hold ciphertext, never plaintext tokens.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- Providers we can ingest from. Apple Health / Health Connect are on-device
-- bridges (no cloud OAuth) and push samples through the same `wearable_samples`
-- table; they are listed so the provider column is closed.
do $$ begin
  create type wearable_provider as enum (
    'whoop',
    'oura',
    'fitbit',
    'garmin',
    'apple_health',
    'health_connect'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type wearable_connection_status as enum ('connected', 'revoked', 'expired');
exception when duplicate_object then null; end $$;

-- Normalized metric vocabulary. Provider-specific fields map onto these so we
-- can trend across sources. Kept narrow for the metabolic wedge.
do $$ begin
  create type wearable_metric as enum (
    'resting_heart_rate',  -- bpm
    'hrv',                 -- ms (RMSSD)
    'sleep_duration',      -- minutes asleep
    'sleep_efficiency',    -- percent
    'recovery_score',      -- percent (provider composite, e.g. Whoop recovery)
    'steps',               -- count (on-device bridges)
    'respiratory_rate'     -- breaths/min
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- wearable_connections — one OAuth (or on-device) link per (user, provider).
-- Tokens are stored as application-encrypted ciphertext.
-- ----------------------------------------------------------------------------
create table if not exists public.wearable_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  provider            wearable_provider not null,
  status              wearable_connection_status not null default 'connected',
  -- Opaque id of the user within the provider's system (non-PHI identifier).
  provider_user_id    text,
  -- Encrypted OAuth tokens (Fernet ciphertext). NEVER plaintext.
  access_token_enc    text,
  refresh_token_enc   text,
  token_expires_at    timestamptz,
  scopes              text[] not null default '{}',
  last_sync_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.wearable_connections is
  'Per-user wearable links. OAuth tokens stored as Fernet ciphertext, never plaintext.';

-- One active connection per (user, provider). Revoked rows are retained for the
-- audit trail, so only constrain non-revoked ones.
create unique index if not exists wearable_connections_one_active
  on public.wearable_connections (user_id, provider)
  where status <> 'revoked';

drop trigger if exists wearable_connections_touch_updated_at on public.wearable_connections;
create trigger wearable_connections_touch_updated_at
  before update on public.wearable_connections
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- wearable_samples — normalized, deduplicated health samples (PHI).
-- ----------------------------------------------------------------------------
create table if not exists public.wearable_samples (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  connection_id   uuid references public.wearable_connections (id) on delete set null,
  provider        wearable_provider not null,
  metric          wearable_metric not null,
  value           double precision not null,
  unit            text not null,
  -- Time window the sample covers. For point metrics start = end.
  start_time      timestamptz not null,
  end_time        timestamptz not null,
  -- Stable key for idempotent upserts: provider + metric + window identity.
  -- Lets repeated syncs avoid duplicate rows.
  dedup_key       text not null,
  created_at      timestamptz not null default now(),

  constraint wearable_samples_window_ok check (end_time >= start_time)
);

comment on table public.wearable_samples is
  'Normalized wearable health samples (PHI). Reads require wearable_sync consent '
  'and are audited. dedup_key makes re-syncs idempotent.';

create unique index if not exists wearable_samples_dedup
  on public.wearable_samples (user_id, dedup_key);

create index if not exists wearable_samples_user_metric_time_idx
  on public.wearable_samples (user_id, metric, start_time desc);

-- ============================================================================
-- Row Level Security — owner-only, mirroring the M0 pattern.
-- ============================================================================

alter table public.wearable_connections enable row level security;
alter table public.wearable_samples     enable row level security;

-- Connections: a user manages only their own. Token ciphertext is still only
-- readable by the owner; the service role (used server-side for sync) bypasses
-- RLS to refresh tokens.
drop policy if exists wearable_connections_select_own on public.wearable_connections;
create policy wearable_connections_select_own on public.wearable_connections
  for select using (auth.uid() = user_id);

drop policy if exists wearable_connections_insert_own on public.wearable_connections;
create policy wearable_connections_insert_own on public.wearable_connections
  for insert with check (auth.uid() = user_id);

drop policy if exists wearable_connections_update_own on public.wearable_connections;
create policy wearable_connections_update_own on public.wearable_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Samples: a user reads only their own. Inserts happen via the service role
-- during sync (RLS bypassed); end users get no insert/update/delete policy.
drop policy if exists wearable_samples_select_own on public.wearable_samples;
create policy wearable_samples_select_own on public.wearable_samples
  for select using (auth.uid() = user_id);
