-- Payment reminders: 3 reminders every N hours from the due date, then the
-- creator is prompted to send the legal notice (never sent automatically).
alter table profiles add column remind_every_hours integer not null default 8
  check (remind_every_hours in (8, 12, 18, 24, 36, 48));
-- When the creator was emailed "time to send the legal notice" (once per deal).
alter table deals add column notice_prompted_at timestamptz;
