-- ============================================================================
-- RK Solutions — Recovery Ops Platform
-- Phase 1: Foundation schema (all tables from CLAUDE.md §7) + RLS + audit log.
--
-- Design notes:
--   * Two APP roles govern access: `admin` (full) and `operator` (case work only).
--     These are distinct from `staff.role` (the pay/HR role of a DRA or manager).
--   * RLS is ON for every table. Operators can NEVER read payout_* / hdfc_* /
--     payout_rules — enforced at the DB layer, not just the UI.
--   * A generic AFTER trigger writes before/after JSON to `audit_log` on writes.
--   * `is_admin()` / `is_active_user()` are SECURITY DEFINER so RLS policies that
--     call them do not recurse into `profiles`' own policies.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type app_role            as enum ('admin', 'operator');
  create type staff_role          as enum ('field_exec', 'back_office', 'manager', 'office');
  create type pay_type            as enum ('fixed', 'commission', 'both');
  create type case_status         as enum ('STAB', 'RB', 'FLOW', 'NR', 'ABOVE_2_EMIS');
  create type case_event_type     as enum ('status_change', 'ptp', 'rtp', 'visit', 'note', 'receipt', 'repo', 'settlement', 'foreclosure');
  create type resolution_type     as enum ('repo', 'settlement', 'foreclosure');
  create type payout_component_type as enum ('fixed', 'flat_pct', 'bucket_pct', 'event');
  create type payout_run_status   as enum ('draft', 'locked');
  create type bill_status         as enum ('draft', 'raised', 'part_paid', 'settled');
  create type audit_action        as enum ('INSERT', 'UPDATE', 'DELETE');
exception
  when duplicate_object then null;
end $$;

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- App-role checks. SECURITY DEFINER to avoid RLS recursion on `profiles`.
create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active and app_role = 'admin'
  );
$$;

-- ============================================================================
-- profiles — one row per app login (links to auth.users)
-- ============================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  app_role   app_role not null default 'operator',
  active      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- staff — DRAs and internal staff (NOT app logins). Payout/billing attach here.
-- ============================================================================
create table public.staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       staff_role not null default 'field_exec',
  pay_type   pay_type not null default 'commission',
  active      boolean not null default true,
  joined_at  date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_staff_updated before update on public.staff
  for each row execute function public.set_updated_at();

-- ============================================================================
-- upload_batches — one row per HDFC allocation file ingest
-- ============================================================================
create table public.upload_batches (
  id               uuid primary key default gen_random_uuid(),
  allocation_month text not null,                 -- 'YYYY-MM'
  filename         text not null,
  storage_path     text,                          -- Supabase Storage object path
  uploaded_by      uuid references public.profiles(id),
  row_count        integer not null default 0,
  committed_at     timestamptz,                   -- null while staged/preview
  created_at       timestamptz not null default now()
);
create index idx_upload_batches_month on public.upload_batches(allocation_month);

-- ============================================================================
-- cases — master case ledger (fields per §5)
-- ============================================================================
create table public.cases (
  id               uuid primary key default gen_random_uuid(),
  allocation_month text not null,                 -- 'YYYY-MM' (dedup key part)
  upload_batch_id  uuid references public.upload_batches(id),

  loan_no          text not null,                 -- natural key (dedup key part)
  customer_name    text,
  father_name      text,
  branch           text,
  product          text,
  bucket           text check (bucket in ('X','1','2','3','4','5','6')),

  pos              numeric(14,2),
  emi              numeric(14,2),
  total_emi_due    numeric(14,2),
  emis_due_count   integer,

  current_status   case_status,
  receipt_amount   numeric(14,2),                 -- amount booked on the alloc file
  receipt_no       text,
  receipt_date     date,

  dra_name         text,
  dra_id           uuid references public.staff(id),

  allocation_date  date,
  alloc_type       text,
  repo_flag        boolean,
  npa_stage        text,
  dpd              integer,
  risk_dpd         integer,
  bounces          integer,

  vehicle_reg_no   text,
  vehicle_model    text,
  engine_no        text,
  chassis_no       text,
  disbursal_date   date,
  tenure           integer,

  address_json     jsonb,                         -- address/contact block
  source_row_json  jsonb,                         -- raw parsed row (conflict detection)
  operator_touched boolean not null default false,-- edit-wins flag for re-upload (§5)

  -- resolved = held bucket (STAB) or rolled back (RB); FLOW/NR/ABOVE are not.
  is_resolved      boolean generated always as (current_status in ('STAB','RB')) stored,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (loan_no, allocation_month)              -- idempotent ingest (§13)
);
create index idx_cases_month  on public.cases(allocation_month);
create index idx_cases_bucket on public.cases(bucket);
create index idx_cases_dra    on public.cases(dra_id);
create index idx_cases_status on public.cases(current_status);
create trigger trg_cases_updated before update on public.cases
  for each row execute function public.set_updated_at();

-- ============================================================================
-- case_events — append-only trail (status changes, PTP/RTP, visits, notes...)
-- ============================================================================
create table public.case_events (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  event_type case_event_type not null,
  payload_json jsonb not null default '{}'::jsonb,
  event_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_case_events_case on public.case_events(case_id);

-- ============================================================================
-- receipts — collections (source for payout + billing)
-- ============================================================================
create table public.receipts (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  dra_id       uuid references public.staff(id),
  receipt_no   text,
  amount       numeric(14,2) not null,
  receipt_date date not null default current_date,
  created_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);
create index idx_receipts_case on public.receipts(case_id);
create index idx_receipts_dra  on public.receipts(dra_id);

-- ============================================================================
-- resolutions — terminal outcomes (repo / settlement / foreclosure)
-- ============================================================================
create table public.resolutions (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases(id) on delete cascade,
  dra_id        uuid references public.staff(id),
  type          resolution_type not null,
  amount        numeric(14,2),
  resolved_date date not null default current_date,
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_resolutions_case on public.resolutions(case_id);
create index idx_resolutions_dra  on public.resolutions(dra_id);

-- ============================================================================
-- expenses — for P&L
-- ============================================================================
create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  month      text not null,                       -- 'YYYY-MM'
  category   text,
  amount     numeric(14,2) not null,
  note       text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_expenses_month on public.expenses(month);

-- ============================================================================
-- payout_rules — configurable payout components (§8). ADMIN-ONLY.
-- ============================================================================
create table public.payout_rules (
  id             uuid primary key default gen_random_uuid(),
  staff_id       uuid references public.staff(id) on delete cascade, -- null = role default
  role           staff_role,                       -- used when staff_id is null
  component_type payout_component_type not null,
  params         jsonb not null default '{}'::jsonb,-- {amount|pct|per_bucket|event...}
  ordinal        integer not null default 0,        -- component ordering
  effective_from date not null default current_date,
  effective_to   date,                              -- null = open-ended
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (staff_id is not null or role is not null)
);
create index idx_payout_rules_staff on public.payout_rules(staff_id);
create trigger trg_payout_rules_updated before update on public.payout_rules
  for each row execute function public.set_updated_at();

-- ============================================================================
-- payout_runs / payout_lines — computed monthly payout (§8). ADMIN-ONLY.
-- ============================================================================
create table public.payout_runs (
  id         uuid primary key default gen_random_uuid(),
  period     text not null,                        -- 'YYYY-MM'
  status     payout_run_status not null default 'draft',
  total      numeric(14,2) not null default 0,
  locked_at  timestamptz,
  locked_by  uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_payout_runs_period on public.payout_runs(period);
create trigger trg_payout_runs_updated before update on public.payout_runs
  for each row execute function public.set_updated_at();

create table public.payout_lines (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.payout_runs(id) on delete cascade,
  staff_id     uuid not null references public.staff(id),
  total        numeric(14,2) not null default 0,
  breakdown    jsonb not null default '[]'::jsonb, -- per-component explainability
  created_at   timestamptz not null default now()
);
create index idx_payout_lines_run on public.payout_lines(run_id);

-- ============================================================================
-- hdfc_rate_card — configurable billing rules, versioned (§9). ADMIN-ONLY.
-- ============================================================================
create table public.hdfc_rate_card (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  config         jsonb not null default '{}'::jsonb, -- bucket %s, flat fees, referral
  effective_from date not null default current_date,
  effective_to   date,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_hdfc_rate_card_updated before update on public.hdfc_rate_card
  for each row execute function public.set_updated_at();

-- ============================================================================
-- hdfc_bills / hdfc_payments — bill + reconciliation (§9). ADMIN-ONLY.
-- ============================================================================
create table public.hdfc_bills (
  id             uuid primary key default gen_random_uuid(),
  period         text not null,                    -- 'YYYY-MM'
  computed_amount numeric(14,2) not null default 0,
  adjustments    numeric(14,2) not null default 0,
  final_amount   numeric(14,2) not null default 0,
  breakdown      jsonb not null default '{}'::jsonb,
  status         bill_status not null default 'draft',
  rate_card_id   uuid references public.hdfc_rate_card(id),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index idx_hdfc_bills_period on public.hdfc_bills(period);
create trigger trg_hdfc_bills_updated before update on public.hdfc_bills
  for each row execute function public.set_updated_at();

create table public.hdfc_payments (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references public.hdfc_bills(id) on delete cascade,
  amount        numeric(14,2) not null,
  received_date date not null default current_date,
  utr_ref       text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index idx_hdfc_payments_bill on public.hdfc_payments(bill_id);

-- ============================================================================
-- audit_log — who changed what (written by trigger; §7)
-- ============================================================================
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid,                                -- auth.uid() at write time
  table_name  text not null,
  row_id      text,
  action      audit_action not null,
  before_json jsonb,
  after_json  jsonb,
  at          timestamptz not null default now()
);
create index idx_audit_log_table on public.audit_log(table_name, at desc);

-- Generic audit trigger: captures before/after for every write.
create or replace function public.audit_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row_id text;
begin
  if (tg_op = 'DELETE') then
    v_row_id := (to_jsonb(old) ->> 'id');
    insert into public.audit_log(actor, table_name, row_id, action, before_json, after_json)
      values (auth.uid(), tg_table_name, v_row_id, 'DELETE', to_jsonb(old), null);
    return old;
  elsif (tg_op = 'UPDATE') then
    v_row_id := (to_jsonb(new) ->> 'id');
    insert into public.audit_log(actor, table_name, row_id, action, before_json, after_json)
      values (auth.uid(), tg_table_name, v_row_id, 'UPDATE', to_jsonb(old), to_jsonb(new));
    return new;
  else -- INSERT
    v_row_id := (to_jsonb(new) ->> 'id');
    insert into public.audit_log(actor, table_name, row_id, action, before_json, after_json)
      values (auth.uid(), tg_table_name, v_row_id, 'INSERT', null, to_jsonb(new));
    return new;
  end if;
end $$;

-- Attach audit trigger to every write-bearing business table.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','staff','upload_batches','cases','case_events','receipts',
    'resolutions','expenses','payout_rules','payout_runs','payout_lines',
    'hdfc_rate_card','hdfc_bills','hdfc_payments'
  ] loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_write();', t);
  end loop;
end $$;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles       enable row level security;
alter table public.staff          enable row level security;
alter table public.upload_batches enable row level security;
alter table public.cases          enable row level security;
alter table public.case_events    enable row level security;
alter table public.receipts       enable row level security;
alter table public.resolutions    enable row level security;
alter table public.expenses       enable row level security;
alter table public.payout_rules   enable row level security;
alter table public.payout_runs    enable row level security;
alter table public.payout_lines   enable row level security;
alter table public.hdfc_rate_card enable row level security;
alter table public.hdfc_bills     enable row level security;
alter table public.hdfc_payments  enable row level security;
alter table public.audit_log      enable row level security;

-- ── profiles: a user reads/updates their own row; admins manage everyone ────
create policy profiles_self_read   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin())
                                                                 with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for insert with check (public.is_admin());
create policy profiles_admin_del   on public.profiles for delete using (public.is_admin());

-- ── Operational tables: any active app user reads + writes; deletes admin-only.
-- staff
create policy staff_read   on public.staff for select using (public.is_active_user());
create policy staff_write  on public.staff for insert with check (public.is_active_user());
create policy staff_update on public.staff for update using (public.is_active_user()) with check (public.is_active_user());
create policy staff_delete on public.staff for delete using (public.is_admin());

-- upload_batches
create policy ub_read   on public.upload_batches for select using (public.is_active_user());
create policy ub_write  on public.upload_batches for insert with check (public.is_active_user());
create policy ub_update on public.upload_batches for update using (public.is_active_user()) with check (public.is_active_user());
create policy ub_delete on public.upload_batches for delete using (public.is_admin());

-- cases
create policy cases_read   on public.cases for select using (public.is_active_user());
create policy cases_write  on public.cases for insert with check (public.is_active_user());
create policy cases_update on public.cases for update using (public.is_active_user()) with check (public.is_active_user());
create policy cases_delete on public.cases for delete using (public.is_admin());

-- case_events (append-only: insert + read for all; update/delete admin-only)
create policy ce_read   on public.case_events for select using (public.is_active_user());
create policy ce_write  on public.case_events for insert with check (public.is_active_user());
create policy ce_update on public.case_events for update using (public.is_admin()) with check (public.is_admin());
create policy ce_delete on public.case_events for delete using (public.is_admin());

-- receipts
create policy rc_read   on public.receipts for select using (public.is_active_user());
create policy rc_write  on public.receipts for insert with check (public.is_active_user());
create policy rc_update on public.receipts for update using (public.is_active_user()) with check (public.is_active_user());
create policy rc_delete on public.receipts for delete using (public.is_admin());

-- resolutions
create policy rs_read   on public.resolutions for select using (public.is_active_user());
create policy rs_write  on public.resolutions for insert with check (public.is_active_user());
create policy rs_update on public.resolutions for update using (public.is_active_user()) with check (public.is_active_user());
create policy rs_delete on public.resolutions for delete using (public.is_admin());

-- expenses (money-adjacent but needed for P&L entry; keep operator-writable,
-- visible to all active users; deletes admin-only)
create policy ex_read   on public.expenses for select using (public.is_active_user());
create policy ex_write  on public.expenses for insert with check (public.is_active_user());
create policy ex_update on public.expenses for update using (public.is_active_user()) with check (public.is_active_user());
create policy ex_delete on public.expenses for delete using (public.is_admin());

-- ── ADMIN-ONLY tables: operators cannot even SELECT (§7). ───────────────────
-- payout_rules
create policy pr_admin_all on public.payout_rules for all using (public.is_admin()) with check (public.is_admin());
-- payout_runs
create policy prun_admin_all on public.payout_runs for all using (public.is_admin()) with check (public.is_admin());
-- payout_lines
create policy pl_admin_all on public.payout_lines for all using (public.is_admin()) with check (public.is_admin());
-- hdfc_rate_card
create policy rate_admin_all on public.hdfc_rate_card for all using (public.is_admin()) with check (public.is_admin());
-- hdfc_bills
create policy bill_admin_all on public.hdfc_bills for all using (public.is_admin()) with check (public.is_admin());
-- hdfc_payments
create policy pay_admin_all on public.hdfc_payments for all using (public.is_admin()) with check (public.is_admin());

-- ── audit_log: admins read; nobody writes directly (trigger is SECURITY DEFINER)
create policy audit_admin_read on public.audit_log for select using (public.is_admin());
-- no insert/update/delete policies → direct client writes are denied.

-- ============================================================================
-- New-signup bootstrap: create a profile row when an auth user is created.
-- The FIRST user becomes admin (bootstrap); everyone after defaults to operator.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_first boolean;
begin
  select not exists (select 1 from public.profiles) into v_is_first;
  insert into public.profiles (id, email, app_role)
    values (new.id, new.email, case when v_is_first then 'admin' else 'operator' end)
    on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
