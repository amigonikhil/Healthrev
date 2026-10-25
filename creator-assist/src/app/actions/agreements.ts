"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { buildAgreement } from "@/lib/agreement";
import { audit } from "@/lib/audit";
import { decrypt, randomToken, sha256 } from "@/lib/crypto";
import { getTax, loadDeal, requireProfile } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { todayIST } from "@/lib/dates";
import { waLink } from "@/lib/messages";
import { agreementPdf } from "@/lib/pdf";
import { byToken } from "@/lib/sign";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Agreement, AgreementBody, Profile } from "@/lib/types";
import { EMAIL_RE } from "@/lib/validate";

export type SendResult = { ok: true; link: string; wa: string | null; emailed: boolean; note?: string } | { ok: false; error: string };

/** Creates (or re-sends) the e-sign request for a deal. */
export async function sendAgreement(dealId: string, opts: { email: boolean; whatsapp: boolean }): Promise<SendResult> {
  const { db, user, profile } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal) return { ok: false, error: "Deal not found" };
  if (deal.agreement?.status === "signed") return { ok: false, error: "This agreement is already signed" };

  let agreement = deal.agreement;
  if (!agreement) {
    const body = buildAgreement({
      profile, pan: decrypt(profile.pan_enc), brand: deal.brand, deal, deliverables: deal.deliverables, usage: deal.usage, date: todayIST(),
      lateInterestRate: (await getTax(db)).late_interest_rate,
    });
    const { data, error } = await db.from("agreements")
      .insert({ deal_id: deal.id, body, sign_token: randomToken(), is_sample: deal.is_sample })
      .select("*").single<Agreement>();
    if (error || !data) return { ok: false, error: "Could not create the agreement: " + error?.message };
    agreement = data;
    if (deal.status === "draft") await db.from("deals").update({ status: "agreement_sent" }).eq("id", deal.id);
  }

  const link = `${siteUrl()}/s/${agreement.sign_token}`;
  const contact = deal.brand.contact_name || "there";
  const text = `Hi ${contact}, I've sent you our collaboration agreement for ${deal.brand.name}. You can review and sign it here (takes about a minute): ${link}\n\n– ${profile.name}`;

  let emailed = false;
  let note: string | undefined;
  if (opts.email) {
    if (deal.is_sample) note = "Sample deal: email not actually sent";
    else if (!deal.brand.contact_email) note = "No contact email on this brand";
    else {
      const r = await sendEmail({
        to: deal.brand.contact_email, replyTo: profile.email ?? undefined,
        subject: `${profile.name} sent you an agreement to sign`, text,
      });
      emailed = r.sent;
      if (!r.sent) note = r.reason;
    }
  }
  await audit(db, user.id, "agreement_sent", "agreement", agreement.id, { email: emailed, whatsapp: opts.whatsapp });
  revalidatePath(`/deals/${deal.id}`);
  return { ok: true, link, emailed, note, wa: opts.whatsapp ? waLink(deal.brand.contact_whatsapp, text) : null };
}

// ---------------------------------------------------------------- public signing (no login)

const otpHash = (token: string, email: string, code: string) => sha256(`${token}:${email.toLowerCase()}:${code}`);
const showOtpInUi = (sample: boolean) => sample || (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) || process.env.ALLOW_OTP_PREVIEW === "true";

export async function sendSignOtp(token: string, email: string): Promise<{ ok: boolean; message: string }> {
  const a = await byToken(token);
  if (!a || a.status !== "sent") return { ok: false, message: "This link is no longer valid" };
  const to = email.trim();
  if (!EMAIL_RE.test(to)) return { ok: false, message: "Enter a valid email" };
  if (a.otp_expires_at && Date.parse(a.otp_expires_at) - 9.5 * 60_000 > Date.now()) {
    return { ok: false, message: "Please wait 30 seconds before asking for another code" };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const admin = createAdminClient();
  await admin.from("agreements").update({
    otp_hash: otpHash(token, to, code), otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), otp_attempts: 0, signer_email: to,
  }).eq("id", a.id);

  if (showOtpInUi(a.is_sample)) {
    return { ok: true, message: `${a.is_sample ? "Sample deal" : "Test mode"}: no email sent. Your code is ${code}` };
  }
  const r = await sendEmail({
    to, subject: `Your code to sign the ${a.deal.brand.name} agreement`,
    text: `Your one-time code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
  });
  return r.sent ? { ok: true, message: `OTP sent to ${to}` } : { ok: false, message: "Could not send the code: " + r.reason };
}

export type SignState = { error?: string } | undefined;

export async function signAgreement(token: string, _: SignState, f: FormData): Promise<SignState> {
  const a = await byToken(token);
  if (!a) return { error: "This link is no longer valid" };
  if (a.status === "signed") { revalidatePath(`/s/${token}`); return undefined; }

  const name = String(f.get("name") ?? "").trim();
  const designation = String(f.get("designation") ?? "").trim();
  const code = String(f.get("otp") ?? "").replace(/\D/g, "");
  if (!name) return { error: "Enter your name" };
  if (f.get("accept") !== "on") return { error: "Please tick “I accept” to sign" };
  if (!a.otp_hash || !a.signer_email || !a.otp_expires_at) return { error: "Ask for an email OTP first" };
  if (Date.parse(a.otp_expires_at) < Date.now()) return { error: "That code has expired. Send a new one." };
  if (a.otp_attempts >= 5) return { error: "Too many attempts. Send a new code." };

  const admin = createAdminClient();
  if (otpHash(token, a.signer_email, code) !== a.otp_hash) {
    await admin.from("agreements").update({ otp_attempts: a.otp_attempts + 1 }).eq("id", a.id);
    return { error: "That code doesn't match" };
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const signedAt = new Date().toISOString();
  const { data: updated } = await admin.from("agreements").update({
    status: "signed", signer_name: name, signer_designation: designation || null, signed_at: signedAt, signer_ip: ip,
    whatsapp_opt_in: f.get("whatsapp") === "on", otp_hash: null,
  }).eq("id", a.id).eq("status", "sent").select("*").maybeSingle<Agreement>();
  if (!updated) { revalidatePath(`/s/${token}`); return undefined; }

  if (["draft", "agreement_sent"].includes(a.deal.status)) {
    await admin.from("deals").update({ status: "agreed" }).eq("id", a.deal.id);
  }
  await audit(admin, a.user_id, "agreement_signed", "agreement", a.id, { signer: name, ip });

  // Email a PDF copy to both parties (never for sample deals).
  if (!a.is_sample) {
    const { data: creator } = await admin.from("profiles").select("name, email").eq("id", a.user_id).single<Pick<Profile, "name" | "email">>();
    const pdf = await agreementPdf({ body: a.body as AgreementBody, agreement: updated, brandName: a.deal.brand.legal_name || a.deal.brand.name });
    const attachments = [{ filename: `Agreement - ${a.deal.brand.name}.pdf`, content: pdf }];
    const text = `The agreement “${(a.body as AgreementBody).title}” was signed by ${name} on ${new Date(signedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. A PDF copy is attached.`;
    await Promise.all([
      sendEmail({ to: updated.signer_email!, subject: "Signed agreement: " + (a.body as AgreementBody).title, text, attachments }),
      creator?.email ? sendEmail({ to: creator.email, subject: `${a.deal.brand.name} signed your agreement`, text, attachments }) : null,
    ]);
  }
  revalidatePath(`/s/${token}`);
  return undefined;
}
