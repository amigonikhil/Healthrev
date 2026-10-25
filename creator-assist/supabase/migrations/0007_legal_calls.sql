-- 15-minute call with the panel advocate's team, booked after a legal notice.
-- Beta: a booking request only; no payment is taken.
create table legal_call_bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  deal_id     uuid not null,
  slot        timestamptz not null,
  phone       text not null,
  note        text,
  fee_paise   integer not null check (fee_paise >= 0),
  status      text not null default 'requested' check (status in ('requested', 'confirmed', 'done', 'cancelled')),
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  foreign key (deal_id, user_id) references deals (id, user_id) on delete cascade
);
create index legal_call_bookings_deal on legal_call_bookings (deal_id);
alter table legal_call_bookings enable row level security;
create policy own_rows on legal_call_bookings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
