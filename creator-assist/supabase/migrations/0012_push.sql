-- Push notifications for the iOS and Android apps (Expo push service → APNs / FCM).

-- One row per signed-in device. The app registers its Expo push token after the creator
-- allows notifications and removes it on sign-out; the sender drops tokens the push
-- service reports as no longer registered.
create table push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  token         text not null unique,
  platform      text not null check (platform in ('ios', 'android')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index push_tokens_user on push_tokens (user_id);
alter table push_tokens enable row level security;
create policy own_rows on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which pushes the creator wants. A missing key means on:
-- whatsapp_due, payment_due_today, overdue, agreement_signed, tds_mismatch, filing_due.
alter table profiles add column push_prefs jsonb not null default '{}'::jsonb;

-- Every push sent, keyed by what it was about, so each event notifies once.
-- Service role only (no policies).
create table push_log (
  user_id  uuid not null references auth.users on delete cascade,
  kind     text not null,
  ref      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table push_log enable row level security;
