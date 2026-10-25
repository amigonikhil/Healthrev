-- Beta feedback round 1.
-- * Per-deal GST handling: 'add' (fee + GST), 'incl' (fee already includes GST), 'none'.
--   fee_paise is the amount as the creator entered it; the app derives taxable value.
-- * Per-deal TDS rate (0 = brand doesn't deduct TDS), defaulting to the user's tax_config.
-- * Usage rights for any number of months (1–60) or perpetual.
-- * Custom payment terms (1–365 days).
-- * Contractual late-payment interest for agreements, editable in Settings.

alter table deals add column gst_mode text not null default 'add'
  check (gst_mode in ('add', 'incl', 'none'));
alter table deals add column tds_rate numeric(5,2) check (tds_rate between 0 and 100);
update deals d set tds_rate = coalesce((select t.tds_rate from tax_config t where t.user_id = d.user_id), 0);
alter table deals alter column tds_rate set not null;
alter table deals alter column tds_rate set default 0;

alter table deals drop constraint if exists deals_terms_days_check;
alter table deals add constraint deals_terms_days_check check (terms_days between 1 and 365);

alter table usage_rights drop constraint if exists usage_rights_duration_check;
alter table usage_rights add constraint usage_rights_duration_check
  check (duration is null or duration = 'perpetual' or duration ~ '^([1-9]|[1-5][0-9]|60)m$');

-- VERIFY WITH LAWYER/CA: contractual interest on late payment, applied to every agreement.
alter table tax_config add column late_interest_rate numeric(5,2) not null default 36.00
  check (late_interest_rate between 0 and 100);
