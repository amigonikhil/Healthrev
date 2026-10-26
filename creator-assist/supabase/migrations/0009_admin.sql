-- Internal admin dashboard (ADMIN.md). Every table here is service-role only
-- (RLS on, no policies) except notifications, which creators read for themselves.

-- ---------------------------------------------------------------- admins
create table admins (
  user_id     uuid primary key references auth.users on delete cascade,
  role        text not null check (role in ('owner', 'support')),
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

create table admin_audit_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid not null references auth.users on delete cascade,
  action       text not null,         -- view_creator | reveal_phone | change_status | export | ...
  target_type  text,
  target_id    text,
  meta         jsonb not null default '{}',
  at           timestamptz not null default now()
);
create index admin_audit_at on admin_audit_log (at desc);

-- ---------------------------------------------------------------- product events
create table events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users on delete cascade,
  anon_id     text,                  -- browser id, so sign-in steps before an account exist can be counted
  event_name  text not null,
  screen      text,
  properties  jsonb not null default '{}',
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index events_name_at on events (event_name, created_at);
create index events_user_at on events (user_id, created_at);

-- Every new account logs a sign-up, however it was created (email code, Google, phone).
create function public.log_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (user_id, event_name, properties, created_at)
  values (new.id, 'signed_up', jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')), new.created_at);
  return new;
end $$;
create trigger on_auth_user_created_log after insert on auth.users for each row execute function public.log_signup();

-- ---------------------------------------------------------------- queues
-- Admin status + internal note for requests that live in their own tables.
-- A request with no row here is 'new'.
create table queue_state (
  kind        text not null check (kind in ('lawyer_notice', 'ai_call', 'filing', 'ais_upload', 'legal_call')),
  source_id   uuid not null,
  user_id     uuid not null references auth.users on delete cascade,
  status      text not null default 'new' check (status in ('new', 'in_review', 'done', 'rejected')),
  note        text check (length(note) <= 2000),
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (kind, source_id)
);

-- Each AIS upload, whether or not it could be read.
create table ais_uploads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  fy          text not null,
  file_path   text,
  parsed      boolean not null,
  entries     integer not null default 0,
  mismatches  integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table ais_uploads enable row level security;
create policy own_rows on ais_uploads for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- In-app notices to creators (e.g. "your request is being reviewed").
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy read_own on notifications for select using (user_id = auth.uid());
create policy mark_own_read on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- feedback triage
alter table feedback
  add column status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'wont_do')),
  add column tags text[] not null default '{}';

-- Defaults for new creators' rates, reminder templates, etc.
create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references auth.users on delete set null,
  updated_at  timestamptz not null default now()
);

alter table admins enable row level security;
alter table admin_audit_log enable row level security;
alter table events enable row level security;
alter table queue_state enable row level security;
alter table app_settings enable row level security;

-- ---------------------------------------------------------------- backfill history
insert into events (user_id, event_name, properties, created_at)
  select id, 'signed_up', jsonb_build_object('provider', coalesce(raw_app_meta_data ->> 'provider', 'email')), created_at from auth.users;
insert into events (user_id, event_name, created_at) select id, 'onboarding_completed', consent_at from profiles;
insert into events (user_id, event_name, is_sample, created_at) select id, 'sample_loaded', true, sample_seeded_at from profiles where sample_seeded_at is not null;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'deal_created', jsonb_build_object('deal_id', id), is_sample, created_at from deals;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'agreement_sent', jsonb_build_object('deal_id', deal_id), is_sample, sent_at from agreements;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'agreement_signed', jsonb_build_object('deal_id', deal_id), is_sample, signed_at from agreements where signed_at is not null;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select i.user_id, 'invoice_generated', jsonb_build_object('deal_id', i.deal_id), i.is_sample, i.created_at from invoices i;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'reminder_sent', jsonb_build_object('channel', channel, 'kind', kind, 'deal_id', deal_id), is_sample, sent_at from reminders where sent_at is not null;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'payment_recorded', jsonb_build_object('invoice_id', invoice_id), is_sample, created_at from payments;
insert into events (user_id, event_name, properties, is_sample, created_at)
  select user_id, 'escalation_opened', jsonb_build_object('type', type, 'deal_id', deal_id), is_sample, created_at from escalations;
insert into events (user_id, event_name, screen, created_at) select user_id, 'feedback_sent', screen, created_at from feedback where user_id is not null;
insert into events (user_id, event_name, properties, created_at)
  select user_id, 'ais_uploaded', meta, at from audit_log where action = 'ais_uploaded';
insert into events (user_id, event_name, properties, created_at)
  select user_id, 'ai_call_booked', '{}'::jsonb, created_at from ai_call_bookings;
