-- Sample data load / clear, as single transactions.
-- SECURITY INVOKER: they run as the signed-in user, so RLS still applies and a
-- user can only seed or clear their own rows. The payload is built in the app
-- (src/lib/seed.ts) with client-generated ids.

create or replace function seed_sample(payload jsonb) returns boolean
language plpgsql security invoker set search_path = public as $$
begin
  -- Idempotency lock: only the first call after a clear does anything.
  update profiles set sample_seeded_at = now()
   where id = auth.uid() and sample_seeded_at is null;
  if not found then
    return false;
  end if;

  insert into brands            select * from jsonb_populate_recordset(null::brands,            payload->'brands');
  insert into deals             select * from jsonb_populate_recordset(null::deals,             payload->'deals');
  insert into deal_deliverables select * from jsonb_populate_recordset(null::deal_deliverables, payload->'deliverables');
  insert into usage_rights      select * from jsonb_populate_recordset(null::usage_rights,      payload->'usage');
  insert into agreements        select * from jsonb_populate_recordset(null::agreements,        payload->'agreements');
  insert into invoices          select * from jsonb_populate_recordset(null::invoices,          payload->'invoices');
  insert into payments          select * from jsonb_populate_recordset(null::payments,          payload->'payments');
  insert into reminders         select * from jsonb_populate_recordset(null::reminders,         payload->'reminders');
  insert into ais_entries       select * from jsonb_populate_recordset(null::ais_entries,       payload->'ais');
  insert into filings           select * from jsonb_populate_recordset(null::filings,           payload->'filings')
    on conflict (user_id, type, period) do nothing;
  return true;
end $$;

create or replace function clear_sample() returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from reminders   where user_id = auth.uid() and is_sample;
  delete from deals       where user_id = auth.uid() and is_sample;   -- cascades to children
  delete from brands b    where b.user_id = auth.uid() and b.is_sample
    and not exists (select 1 from deals d where d.brand_id = b.id);
  delete from ais_entries where user_id = auth.uid() and is_sample;
  delete from filings     where user_id = auth.uid() and is_sample;
  update profiles set sample_seeded_at = null where id = auth.uid();
end $$;

revoke all on function seed_sample(jsonb) from public, anon;
revoke all on function clear_sample() from public, anon;
grant execute on function seed_sample(jsonb) to authenticated;
grant execute on function clear_sample() to authenticated;
