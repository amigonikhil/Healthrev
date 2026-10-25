-- The creator now sends the lawyer notice themselves (email via Resend, or
-- WhatsApp click-to-send with a link to the PDF). Record how it went out.
alter table escalations add column channel text check (channel in ('email', 'whatsapp'));
