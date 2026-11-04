-- Remote switches for features that launch hidden. The apps read them at start-up
-- through GET /api/v1/config (service role); a flag that is missing or off means the
-- feature does not appear at all. Flip `enabled` to turn a feature on without an app update.
create table feature_flags (
  key          text primary key,
  enabled      boolean not null default false,
  description  text,
  updated_at   timestamptz not null default now()
);
alter table feature_flags enable row level security; -- no policies: service role only

insert into feature_flags (key, enabled, description) values
  ('lawyer_notice',  false, 'Escalate > Lawyer notice'),
  ('file_with_us',   false, 'Tax hub > File with Creator Assist + AI call'),
  ('deal_from_chat', false, 'Paste or share a chat to create a deal');

-- Minimum app version the API supports; older builds are asked to update.
insert into app_settings (key, value) values ('min_app_version', '{"ios": "1.0.0", "android": "1.0.0"}')
  on conflict (key) do nothing;

-- Every event records which app it came from (properties.platform). Sign-ups are logged
-- by this trigger, which can't see the request, so the apps pass their platform in the
-- sign-up metadata (signInWithOtp options.data.platform); anything else counts as web.
create or replace function public.log_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.events (user_id, event_name, properties, created_at)
  values (new.id, 'signed_up', jsonb_build_object(
    'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
    'platform', case when new.raw_user_meta_data ->> 'platform' in ('ios', 'android') then new.raw_user_meta_data ->> 'platform' else 'web' end
  ), new.created_at);
  return new;
end $$;
