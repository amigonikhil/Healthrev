"use server";

import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_RE } from "@/lib/validate";

// Email sign-in codes are created by Supabase (admin generateLink, which does
// not send anything) and emailed by the app through Resend. This keeps
// sign-in independent of Supabase's own mailer/SMTP settings.

const PER_30S = 1;
const PER_HOUR = 6;

export async function sendEmailCode(rawEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email" };
  const admin = createAdminClient();

  // Throttle per address so the form can't be used to flood an inbox.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await admin.from("email_otp_sends").select("sent_at").eq("email", email).gte("sent_at", hourAgo).order("sent_at", { ascending: false });
  const sends = recent ?? [];
  if (sends.length >= PER_HOUR) return { ok: false, error: "Too many codes requested. Try again in an hour, or use Google." };
  if (sends.length >= PER_30S && Date.now() - Date.parse(sends[0].sent_at) < 30_000) {
    return { ok: false, error: "Please wait 30 seconds before asking for another code" };
  }

  // Magic-link generation creates the user on first sign-in.
  let { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error && /not found|no user/i.test(error.message)) {
    const created = await admin.auth.admin.createUser({ email });
    if (created.error) return { ok: false, error: "Could not start sign-in. Please try again." };
    ({ data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email }));
  }
  const code = data?.properties?.email_otp;
  const hash = data?.properties?.hashed_token;
  if (error || !code || !hash) {
    console.error("generateLink failed", error?.message);
    return { ok: false, error: "Could not start sign-in. Please try again." };
  }

  const link = `${siteUrl()}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=magiclink`;
  const sent = await sendEmail({
    to: email,
    subject: `${code} is your Creator Assist sign-in code`,
    text: `Your Creator Assist sign-in code is ${code}\n\nType it in the app to continue. It expires in 1 hour.\nOr sign in with this link: ${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0F172A">
  <p style="font-weight:800;font-size:16px;margin:0 0 16px">Creator Assist</p>
  <p style="font-size:15px;margin:0 0 8px">Your sign-in code is</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 16px">${code}</p>
  <p style="font-size:13px;color:#475569;margin:0 0 16px">Type it in the app to continue. It expires in 1 hour. If you didn't ask for this, ignore this email.</p>
  <p style="margin:0"><a href="${link}" style="display:inline-block;background:#3730A3;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:12px">Or tap here to sign in</a></p>
</div>`,
  });
  if (!sent.sent) {
    console.error("sign-in email failed", sent.reason);
    return { ok: false, error: "Couldn't send the email. Please try again in a minute." };
  }
  await admin.from("email_otp_sends").insert({ email });
  return { ok: true };
}
