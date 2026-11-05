import "server-only";
import { buildAgreement } from "@creator-assist/shared/agreement";
import type { SendAgreementInput, SendAgreementResult } from "@creator-assist/shared/api";
import { lateTerms } from "@creator-assist/shared/calc";
import { todayIST } from "@creator-assist/shared/dates";
import type { DealView } from "@creator-assist/shared/deal-view";
import { waLink } from "@creator-assist/shared/messages";
import type { Agreement, AgreementBody, Profile } from "@creator-assist/shared/types";
import { EMAIL_RE } from "@creator-assist/shared/validate";
import { audit } from "@/lib/audit";
import { sendPush } from "@/lib/push";
import { decrypt, randomToken, sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { track as trackEvent } from "@/lib/events";
import { agreementPdf as renderAgreementPdf } from "@/lib/pdf";
import { byToken, markViewed, type PublicAgreement } from "@/lib/sign";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, track, type ProfileCtx } from "./context";
import { getDeal } from "./deals";

export const signLink = (token: string) => `${siteUrl()}/s/${token}`;

/** The agreement for a deal: the sent/signed one, or a preview of what would be sent. */
export async function agreementView(ctx: ProfileCtx, dealId: string): Promise<{ v: DealView; body: AgreementBody; agreement: Agreement | null; signLink: string | null }> {
  const { v, tax } = await getDeal(ctx, dealId);
  const d = v.d;
  const a = d.agreement;
  const body = a?.body ?? buildAgreement({
    profile: ctx.profile, pan: decrypt(ctx.profile.pan_enc), brand: d.brand, deal: d, deliverables: d.deliverables, usage: d.usage,
    date: todayIST(), lateInterest: lateTerms(tax),
  });
  return { v, body, agreement: a, signLink: a ? signLink(a.sign_token) : null };
}

/** Creates (or re-sends) the e-sign request for a deal. The brand signs on the web link. */
export async function sendAgreement(ctx: ProfileCtx, dealId: string, opts: SendAgreementInput): Promise<SendAgreementResult> {
  const { db, profile } = ctx;
  const { v, tax } = await getDeal(ctx, dealId);
  const deal = v.d;
  if (deal.agreement?.status === "signed") fail(409, "This agreement is already signed");

  let agreement = deal.agreement;
  if (!agreement) {
    const body = buildAgreement({
      profile, pan: decrypt(profile.pan_enc), brand: deal.brand, deal, deliverables: deal.deliverables, usage: deal.usage, date: todayIST(),
      lateInterest: lateTerms(tax),
    });
    const { data, error } = await db.from("agreements")
      .insert({ deal_id: deal.id, body, sign_token: randomToken(), is_sample: deal.is_sample })
      .select("*").single<Agreement>();
    if (error || !data) fail(500, "Could not create the agreement: " + error?.message);
    agreement = data;
    if (deal.status === "draft") await db.from("deals").update({ status: "agreement_sent" }).eq("id", deal.id);
  }

  const link = signLink(agreement.sign_token);
  const contact = deal.brand.contact_name || "there";
  const text = `Hi ${contact}, I've sent you our collaboration agreement for ${deal.brand.name}. You can review and sign it here (takes about a minute): ${link}\n\n– ${profile.name}`;

  let emailed = false;
  let note: string | undefined;
  if (opts.email) {
    if (deal.is_sample) note = "Sample deal: email not actually sent";
    else if (!deal.brand.contact_email) note = "No contact email on this brand";
    else {
      const r = await sendEmail({ to: deal.brand.contact_email, replyTo: profile.email ?? undefined, subject: `${profile.name} sent you an agreement to sign`, text });
      emailed = r.sent;
      if (!r.sent) note = r.reason;
    }
  }
  await audit(db, ctx.user.id, "agreement_sent", "agreement", agreement.id, { email: emailed, whatsapp: opts.whatsapp });
  await track(ctx, "agreement_sent", { sample: deal.is_sample, props: { deal_id: deal.id } });
  return { link, emailed, note, wa: opts.whatsapp ? waLink(deal.brand.contact_whatsapp, text) : null };
}

/** The creator's PDF copy of an agreement (RLS: their own only). */
export async function agreementPdf(ctx: ProfileCtx, agreementId: string): Promise<{ pdf: Buffer; filename: string }> {
  const { data: a } = await ctx.db.from("agreements").select("*, deal:deals(brand:brands(name, legal_name))").eq("id", agreementId).maybeSingle();
  if (!a) fail(404, "Agreement not found", "not_found");
  const brand = (a as { deal: { brand: { name: string; legal_name: string | null } } }).deal.brand;
  const pdf = await renderAgreementPdf({ body: (a as Agreement).body, agreement: a as Agreement, brandName: brand.legal_name || brand.name });
  return { pdf, filename: `Agreement - ${brand.name.replace(/[^\w .-]/g, "")}.pdf` };
}

// ---------------------------------------------------------------- public signing page (no login; web only)

const otpHash = (token: string, email: string, code: string) => sha256(`${token}:${email.toLowerCase()}:${code}`);
const showOtpInUi = (sample: boolean) => sample || (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) || process.env.ALLOW_OTP_PREVIEW === "true";

/** What the brand sees at /s/[token]. Opening it the first time marks the agreement viewed. */
export async function signingPage(token: string): Promise<{ a: PublicAgreement; creatorName: string } | null> {
  const a = await byToken(token);
  if (!a) return null;
  const { data: creator } = await createAdminClient().from("profiles").select("name").eq("id", a.user_id).single();
  if (a.status !== "signed") await markViewed(a);
  return { a, creatorName: creator?.name ?? "A creator" };
}

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

export type SignInput = { name: string; designation?: string; otp: string; accept: boolean; whatsapp: boolean };

/** The brand signs. Returns an error message, or null when signed (or already signed). */
export async function signAgreement(token: string, input: SignInput, ip: string | null): Promise<string | null> {
  const a = await byToken(token);
  if (!a) return "This link is no longer valid";
  if (a.status === "signed") return null;

  const name = input.name.trim();
  const designation = (input.designation ?? "").trim();
  const code = input.otp.replace(/\D/g, "");
  if (!name) return "Enter your name";
  if (!input.accept) return "Please tick “I accept” to sign";
  if (!a.otp_hash || !a.signer_email || !a.otp_expires_at) return "Ask for an email OTP first";
  if (Date.parse(a.otp_expires_at) < Date.now()) return "That code has expired. Send a new one.";
  if (a.otp_attempts >= 5) return "Too many attempts. Send a new code.";

  const admin = createAdminClient();
  if (otpHash(token, a.signer_email, code) !== a.otp_hash) {
    await admin.from("agreements").update({ otp_attempts: a.otp_attempts + 1 }).eq("id", a.id);
    return "That code doesn't match";
  }

  const signedAt = new Date().toISOString();
  const { data: updated } = await admin.from("agreements").update({
    status: "signed", signer_name: name, signer_designation: designation || null, signed_at: signedAt, signer_ip: ip,
    whatsapp_opt_in: input.whatsapp, otp_hash: null,
  }).eq("id", a.id).eq("status", "sent").select("*").maybeSingle<Agreement>();
  if (!updated) return null;

  if (["draft", "agreement_sent"].includes(a.deal.status)) {
    await admin.from("deals").update({ status: "agreed" }).eq("id", a.deal.id);
  }
  await audit(admin, a.user_id, "agreement_signed", "agreement", a.id, { signer: name, ip });
  if (!a.is_sample) {
    // Sent straight away, day or night: the creator is usually waiting for this one.
    await sendPush(a.user_id, "agreement_signed", {
      title: `${a.deal.brand.name} signed your agreement`, body: `Signed by ${name}. You can raise the invoice when the content is live.`,
      url: `/deals/${a.deal_id}`, ref: a.id,
    }, { urgent: true });
  }
  await trackEvent(a.user_id, "agreement_signed", { sample: a.is_sample, props: { deal_id: a.deal_id }, platform: "web" });

  // Email a PDF copy to both parties (never for sample deals).
  if (!a.is_sample) {
    const { data: creator } = await admin.from("profiles").select("name, email").eq("id", a.user_id).single<Pick<Profile, "name" | "email">>();
    const pdf = await renderAgreementPdf({ body: a.body as AgreementBody, agreement: updated, brandName: a.deal.brand.legal_name || a.deal.brand.name });
    const attachments = [{ filename: `Agreement - ${a.deal.brand.name}.pdf`, content: pdf }];
    const text = `The agreement “${(a.body as AgreementBody).title}” was signed by ${name} on ${new Date(signedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. A PDF copy is attached.`;
    await Promise.all([
      sendEmail({ to: updated.signer_email!, subject: "Signed agreement: " + (a.body as AgreementBody).title, text, attachments }),
      creator?.email ? sendEmail({ to: creator.email, subject: `${a.deal.brand.name} signed your agreement`, text, attachments }) : null,
    ]);
  }
  return null;
}
