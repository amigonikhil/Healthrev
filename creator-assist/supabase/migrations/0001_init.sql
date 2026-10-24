-- Creator Assist — beta schema.
-- Money is stored as integer paise (bigint). Every table carries user_id and is
-- protected by RLS so a user can only read and write their own rows.
-- PAN and bank account numbers are encrypted in the app (AES-256-GCM, key in
-- ENCRYPTION_KEY) before they reach this database; only masked forms are stored
-- in clear.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type deal_status as enum (
  'draft', 'agreement_sent', 'agreed', 'in_progress', 'live',
  'invoiced', 'overdue', 'escalated', 'partially_paid', 'paid'
);
create type paid_by as enum ('brand', 'agency');
create type agreement_status as enum ('sent', 'signed', 'void');
create type reminder_kind as enum ('payment', 'tds');
create type reminder_channel as enum ('email', 'whatsapp');
create type msg_language as enum ('en', 'te', 'hi');
create type escalation_type as enum ('final_reminder', 'lawyer_notice', 'msme_samadhaan');
create type filing_type as enum ('gstr1', 'gstr3b', 'advance_tax', 'itr');
create type filer as enum ('creator_assist', 'own_ca');

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table profiles (
  id                  uuid primary key references auth.users on delete cascade,
  name                text not null,
  handle              text,
  phone               text,
  email               text,
  address             text,
  city                text,
  state               text not null,
  state_code          text not null check (state_code ~ '^[0-9]{2}$'),
  pan_enc             text,
  pan_masked          text,
  gstin               text,
  udyam_no            text,
  bank_name           text,
  bank_account_enc    text,
  bank_account_last4  text,
  ifsc                text,
  upi                 text,
  invoice_prefix      text not null default 'INV',
  default_terms_days  int  not null default 45 check (default_terms_days in (30, 45, 60)),
  reminder_ladder     int[] not null default '{0,7,15,30}',
  remind_whatsapp     boolean not null default true,
  remind_email        boolean not null default true,
  language            msg_language not null default 'en',
  files_with          filer not null default 'creator_assist',
  consent_at          timestamptz not null,
  sample_seeded_at    timestamptz,
  ais_updated_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Tax rates are configuration, never constants in code. These column defaults
-- are only the starting values for a new account and are editable in Settings.
-- VERIFY WITH CA: GST 18% on creator services, TDS 10% (s.194J/194R),
-- MSME interest = 3 × RBI bank rate (MSMED Act s.16).
create table tax_config (
  user_id        uuid primary key references auth.users on delete cascade default auth.uid(),
  gst_rate       numeric(5,2) not null default 18.00 check (gst_rate between 0 and 100),
  tds_rate       numeric(5,2) not null default 10.00 check (tds_rate between 0 and 100),
  rbi_bank_rate  numeric(5,2) not null default 5.50  check (rbi_bank_rate between 0 and 100),
  msme_multiple  numeric(4,2) not null default 3.00  check (msme_multiple between 0 and 10),
  updated_at     timestamptz not null default now()
);
create trigger tax_config_updated before update on tax_config
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- brands
create table brands (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade default auth.uid(),
  name              text not null,
  legal_name        text,
  gstin             text,
  tan               text,
  city              text,
  state             text,
  state_code        text check (state_code is null or state_code ~ '^[0-9]{2}$'),
  contact_name      text,
  contact_email     text,
  contact_whatsapp  text,
  cc_email          text,
  agency_name       text,
  is_sample         boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (id, user_id)
);
create index brands_user on brands (user_id);

-- ---------------------------------------------------------------- deals
create table deals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users on delete cascade default auth.uid(),
  brand_id             uuid not null,
  paid_by              paid_by not null default 'brand',
  fee_paise            bigint not null check (fee_paise > 0),
  advance_paise        bigint not null default 0 check (advance_paise >= 0),
  advance_received_at  date,
  go_live_date         date,
  terms_days           int not null default 45 check (terms_days in (30, 45, 60)),
  status               deal_status not null default 'draft',
  is_sample            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  foreign key (brand_id, user_id) references brands (id, user_id),  -- NO ACTION: checked at statement end, so account deletion cascades cleanly
  check (advance_paise <= fee_paise)
);
create index deals_user on deals (user_id);
create trigger deals_updated before update on deals
  for each row execute function set_updated_at();

create table deal_deliverables (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid(),
  deal_id   uuid not null,
  platform  text not null,
  type      text not null,
  quantity  int not null check (quantity between 1 and 999),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);
create index deal_deliverables_deal on deal_deliverables (deal_id);

-- Usage rights are always included in the fee; there is no price column.
create table usage_rights (
  deal_id   uuid primary key,
  user_id   uuid not null default auth.uid(),
  enabled   boolean not null default false,
  duration  text check (duration in ('1m', '3m', '6m', '12m', 'perpetual')),
  scope     text check (scope in ('organic_paid', 'organic', 'paid')),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------- agreements
create table agreements (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid(),
  deal_id             uuid not null,
  body                jsonb not null,           -- {title, subtitle, clauses: [[heading, text], ...]}
  sign_token          text not null unique,
  status              agreement_status not null default 'sent',
  sent_at             timestamptz not null default now(),
  viewed_at           timestamptz,
  signer_name         text,
  signer_designation  text,
  signer_email        text,
  signed_at           timestamptz,
  signer_ip           text,
  whatsapp_opt_in     boolean,
  otp_hash            text,
  otp_expires_at      timestamptz,
  otp_attempts        int not null default 0,
  is_sample           boolean not null default false,
  created_at          timestamptz not null default now(),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);
create index agreements_deal on agreements (deal_id);

-- ---------------------------------------------------------------- invoices
create table invoices (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid(),
  deal_id                 uuid not null unique,
  number                  text not null,
  fy                      text not null,        -- '2026-27'
  seq                     int  not null,
  invoice_date            date not null,
  due_date                date not null,
  taxable_paise           bigint not null,
  cgst_paise              bigint not null default 0,
  sgst_paise              bigint not null default 0,
  igst_paise              bigint not null default 0,
  gst_rate                numeric(5,2) not null default 0,
  total_paise             bigint not null,
  advance_deducted_paise  bigint not null default 0,
  balance_due_paise       bigint not null,
  tds_rate                numeric(5,2) not null default 0,
  lines                   jsonb not null,       -- [{label, sac, amount_paise}]
  pdf_path                text,
  is_sample               boolean not null default false,
  created_at              timestamptz not null default now(),
  unique (user_id, number),
  unique (user_id, fy, seq),
  unique (id, user_id),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);

create table payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  invoice_id    uuid not null,
  amount_paise  bigint not null check (amount_paise >= 0),
  tds_paise     bigint not null default 0 check (tds_paise >= 0),
  received_on   date not null,
  utr           text,
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  foreign key (invoice_id, user_id) references invoices (id, user_id) on delete cascade
);
create index payments_invoice on payments (invoice_id);

-- ---------------------------------------------------------------- reminders
create table reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  deal_id       uuid,
  brand_id      uuid,
  kind          reminder_kind not null,
  stage         text not null,                -- friendly | follow_up | firm | final | form16a
  channel       reminder_channel not null default 'email',
  language      msg_language not null default 'en',
  message       text,
  scheduled_at  timestamptz not null,
  sent_at       timestamptz,
  read_at       timestamptz,
  cancelled_at  timestamptz,
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  check (deal_id is not null or brand_id is not null),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade,
  foreign key (brand_id, user_id) references brands (id, user_id) on delete cascade
);
create index reminders_due on reminders (scheduled_at) where sent_at is null and cancelled_at is null;
create index reminders_deal on reminders (deal_id);

-- ---------------------------------------------------------------- escalations
create table escalations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  deal_id     uuid not null,
  type        escalation_type not null,
  draft       text,
  status      text not null default 'draft' check (status in ('draft', 'in_review', 'sent', 'closed')),
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------- tax
create table ais_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  fy             text not null,
  deductor_name  text not null,
  tan            text,
  amount_paise   bigint not null,               -- TDS deducted per AIS
  source         text not null default 'upload' check (source in ('upload', 'manual', 'sample')),
  file_path      text,
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now()
);
create index ais_user_fy on ais_entries (user_id, fy);

create table filings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  type          filing_type not null,
  period        text not null,                  -- '2026-10', '2026-27', '2026-27-Q4'
  due_date      date not null,
  handled_by    filer not null default 'creator_assist',
  status        text not null default 'pending' check (status in ('pending', 'ready', 'filed')),
  data_sent_at  timestamptz,
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (user_id, type, period)
);

create table ai_call_bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  slot        timestamptz not null,
  language    text not null,
  phone       text not null,
  consent     boolean not null check (consent),
  status      text not null default 'booked' check (status in ('booked', 'done', 'cancelled')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- beta + audit
create table feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users on delete set null default auth.uid(),
  screen      text not null,
  message     text not null check (length(message) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create table audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  action     text not null,   -- agreement_viewed | agreement_signed | reminder_sent | payment_recorded | ...
  entity     text,
  entity_id  uuid,
  meta       jsonb not null default '{}',
  at         timestamptz not null default now()
);
create index audit_user on audit_log (user_id, at desc);

-- ---------------------------------------------------------------- RLS
alter table profiles enable row level security;
create policy own_profile on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array[
    'tax_config', 'brands', 'deals', 'deal_deliverables', 'usage_rights',
    'agreements', 'invoices', 'payments', 'reminders', 'escalations',
    'ais_entries', 'filings', 'ai_call_bookings'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- Feedback: testers can submit, nobody reads through the API (admin page uses the service role).
alter table feedback enable row level security;
create policy submit_feedback on feedback for insert
  with check (user_id is null or user_id = auth.uid());

-- Audit log is append-only for its owner.
alter table audit_log enable row level security;
create policy read_own_audit on audit_log for select using (user_id = auth.uid());
create policy write_own_audit on audit_log for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public)
values ('ais', 'ais', false)
on conflict (id) do nothing;

create policy ais_own_files on storage.objects for all
  using (bucket_id = 'ais' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'ais' and (storage.foldername(name))[1] = auth.uid()::text);
