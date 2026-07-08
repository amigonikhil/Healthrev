-- ============================================================================
-- Optional seed data for local/dev testing. Safe to run repeatedly.
-- Real money figures are entered by the admin in-app; these are placeholders
-- so the config screens are testable (CLAUDE.md §8).
-- NOTE: profiles are created by the auth signup trigger — do not seed logins here.
-- ============================================================================

-- Example staff (DRAs + internal). Deterministic ids for repeatable seeding.
insert into public.staff (id, name, role, pay_type, active, joined_at) values
  ('11111111-1111-1111-1111-111111111111', 'Ramesh Kumar',  'field_exec',  'commission', true, '2025-04-01'),
  ('22222222-2222-2222-2222-222222222222', 'Suresh Yadav',  'field_exec',  'both',       true, '2025-04-01'),
  ('33333333-3333-3333-3333-333333333333', 'Anita Desai',   'back_office', 'fixed',      true, '2025-04-01'),
  ('44444444-4444-4444-4444-444444444444', 'Vijay Menon',   'manager',     'both',       true, '2025-04-01')
on conflict (id) do nothing;

-- Example payout rule sets (ILLUSTRATIVE — replace with real numbers in-app):
--   * Ramesh: flat 4% commission on his collections.
--   * Suresh: fixed base + bucket-tiered commission + per-settlement event fee.
--   * Anita:  fixed monthly salary (back office).
insert into public.payout_rules (staff_id, component_type, params, ordinal, effective_from) values
  ('11111111-1111-1111-1111-111111111111', 'flat_pct',
     '{"pct": 4}'::jsonb, 0, '2025-04-01'),

  ('22222222-2222-2222-2222-222222222222', 'fixed',
     '{"amount": 15000}'::jsonb, 0, '2025-04-01'),
  ('22222222-2222-2222-2222-222222222222', 'bucket_pct',
     '{"per_bucket": {"X": 2, "1": 3, "2": 3.5, "3": 4, "4": 5, "5": 6, "6": 7}}'::jsonb, 1, '2025-04-01'),
  ('22222222-2222-2222-2222-222222222222', 'event',
     '{"settlement": 2000, "foreclosure": 3000, "repo": 5000}'::jsonb, 2, '2025-04-01'),

  ('33333333-3333-3333-3333-333333333333', 'fixed',
     '{"amount": 25000}'::jsonb, 0, '2025-04-01')
on conflict do nothing;

-- Example (empty) rate card scaffold so the billing config screen has a version.
insert into public.hdfc_rate_card (name, config, effective_from) values
  ('FY26-27 base (placeholder)',
   '{"bucket_pct": {"X": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0},
     "flat_fees": {"repo": 0, "settlement": 0, "foreclosure": 0, "referral": 0}}'::jsonb,
   '2026-04-01')
on conflict do nothing;
