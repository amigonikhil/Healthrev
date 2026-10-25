-- Late-payment interest in agreements is now 10% a week by default (rate and
-- period editable in Settings), and the lawyer notice claims a legal fee.
-- VERIFY WITH LAWYER: very high contractual interest can be read down as a penalty.
alter table tax_config
  add column late_interest_period text not null default 'week' check (late_interest_period in ('week', 'year')),
  add column notice_legal_fee_paise integer not null default 500000 check (notice_legal_fee_paise between 0 and 100000000);
alter table tax_config alter column late_interest_rate set default 10.00;
update tax_config set late_interest_rate = 10.00, late_interest_period = 'week';
