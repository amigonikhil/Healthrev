-- Sign-in codes are emailed by the app through Resend (not Supabase's mailer).
-- This table throttles those sends per address. Service role only: RLS is on
-- with no policies, so it isn't reachable through the public API.
create table email_otp_sends (
  id       bigint generated always as identity primary key,
  email    text not null,
  sent_at  timestamptz not null default now()
);
create index email_otp_sends_email_at on email_otp_sends (email, sent_at desc);
alter table email_otp_sends enable row level security;
