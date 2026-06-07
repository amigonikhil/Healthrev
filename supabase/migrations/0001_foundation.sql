-- ============================================================================
-- M0 — Foundation migration
-- Chronic Health Tracker (pre-diabetes / metabolic MVP)
--
-- Compliance scaffolding FIRST (DPDPA): every read of user health data must be
-- backed by a valid, unexpired, purpose-specific consent record, and every read
-- must leave an audit trail. These tables exist before any feature table.
--
-- Conventions:
--   * UUID primary keys (gen_random_uuid from pgcrypto, bundled with Supabase).
--   * Row Level Security ON for every table that references a user.
--   * NO PHI (marker values, names, DOB, etc.) lives in the audit log.
--   * Timestamps are timestamptz, stored in UTC.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------

-- Purposes are intentionally narrow and explicit. DPDPA requires consent to be
-- purpose-specific, so we enumerate purposes rather than free-texting them.
do $$ begin
  create type consent_purpose as enum (
    'wearable_sync',        -- read wearable signals (sleep, RHR, HRV, steps, CGM)
    'lab_report_ingestion', -- upload + extract lab reports
    'marker_storage',       -- store confirmed lab marker values
    'trend_analysis',       -- compute trends / projections over stored data
    'notifications'         -- send health nudges / reminders
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type consent_status as enum ('granted', 'revoked');
exception when duplicate_object then null; end $$;

-- Audit actions are coarse-grained and contain no PHI.
do $$ begin
  create type audit_action as enum (
    'consent.grant',
    'consent.revoke',
    'data.read',
    'data.write',
    'data.delete',
    'export.request',
    'auth.login'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- profiles — app-level user record, 1:1 with Supabase auth.users
-- Deliberately minimal. No PHI beyond what's needed to operate the account.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  -- The single chronic condition this account is tracking. MVP: pre-diabetes only.
  condition       text not null default 'prediabetes'
                    check (condition in ('prediabetes')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.profiles is
  'App-level user profile, 1:1 with auth.users. Holds no lab values (no PHI).';

-- ----------------------------------------------------------------------------
-- consents — the gate in front of every health-data read.
-- A read is permitted only when a row exists with:
--   status = 'granted' AND revoked_at IS NULL AND (expires_at IS NULL OR > now())
-- matching the requested purpose.
-- ----------------------------------------------------------------------------
create table if not exists public.consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  purpose         consent_purpose not null,
  status          consent_status not null default 'granted',
  -- Free-form but non-PHI description of scope, e.g. which marker categories /
  -- wearable signal types this consent covers. Stored as JSON for flexibility.
  scope           jsonb not null default '{}'::jsonb,
  -- Version of the consent text / policy the user agreed to (audit requirement).
  policy_version  text not null,
  granted_at      timestamptz not null default now(),
  -- Null = no expiry. DPDPA favours bounded consent; callers should set this.
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),

  constraint consents_revoked_consistency
    check ((status = 'revoked') = (revoked_at is not null))
);

comment on table public.consents is
  'Purpose-specific consent records. A health-data read requires a matching, '
  'non-revoked, unexpired, granted row.';

-- Fast lookup of the active consent for a (user, purpose).
create index if not exists consents_user_purpose_idx
  on public.consents (user_id, purpose);

-- At most one *active* (granted, not revoked) consent per (user, purpose).
-- Revoked rows are retained for the audit trail, so we only constrain active ones.
create unique index if not exists consents_one_active_per_purpose
  on public.consents (user_id, purpose)
  where status = 'granted' and revoked_at is null;

-- ----------------------------------------------------------------------------
-- audit_log — append-only record of every access to user health data.
-- MUST contain no PHI. References the consent that authorised the action so an
-- access can always be traced back to a consent record.
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  -- The user whose data was touched.
  user_id         uuid references public.profiles (id) on delete set null,
  -- Who performed the action: the user themselves, or a system/service actor.
  actor           text not null default 'user',
  action          audit_action not null,
  -- Coarse resource descriptor, e.g. 'marker', 'wearable_sample'. NOT a value.
  resource_type   text,
  -- Opaque id of the touched resource. Never a marker value.
  resource_id     uuid,
  purpose         consent_purpose,
  -- The consent that authorised this access (null for non-gated actions).
  consent_id      uuid references public.consents (id) on delete set null,
  -- Non-PHI structured context only (counts, status codes, request id, etc.).
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only audit trail of health-data access. Contains NO PHI. '
  'Every gated read/write links to the authorising consent_id.';

create index if not exists audit_log_user_idx on public.audit_log (user_id, created_at desc);

-- Block UPDATE/DELETE on the audit log so it stays append-only (defence in depth;
-- RLS below also denies these, but a trigger covers the service role too).
create or replace function public.audit_log_is_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only; % not permitted', tg_op;
end;
$$;

drop trigger if exists audit_log_no_mutate on public.audit_log;
create trigger audit_log_no_mutate
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-provision a profile when a Supabase auth user is created.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles  enable row level security;
alter table public.consents  enable row level security;
alter table public.audit_log enable row level security;

-- profiles: a user sees and edits only their own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- consents: a user sees and creates their own consents.
drop policy if exists consents_select_own on public.consents;
create policy consents_select_own on public.consents
  for select using (auth.uid() = user_id);

drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert with check (auth.uid() = user_id);

-- Revocation is the only allowed mutation, and only by the owner.
drop policy if exists consents_update_own on public.consents;
create policy consents_update_own on public.consents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_log: a user can READ their own trail (DPDPA transparency) but never write
-- or alter it. Writes happen through the service role / SECURITY DEFINER paths.
drop policy if exists audit_log_select_own on public.audit_log;
create policy audit_log_select_own on public.audit_log
  for select using (auth.uid() = user_id);
-- (no insert/update/delete policies for end users → denied by default)
