import "server-only";
import { ADVOCATE, LEGAL_CALL, NOTICE_DAYS } from "@creator-assist/shared/advocate";
import type { LegalCallInput } from "@creator-assist/shared/api";
import type { DealView } from "@creator-assist/shared/deal-view";
import { waLink } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import { noticeText } from "@creator-assist/shared/notice";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { noticeFor, noticeToken } from "@/lib/notice-data";
import { noticePdf } from "@/lib/notice-pdf";
import { fail, track, type ProfileCtx } from "./context";
import { getDeal } from "./deals";

/** Escalation options for a deal, and where it stands once a legal notice has gone out. */
export async function escalateView(ctx: ProfileCtx, dealId: string) {
  const { v, tax, today } = await getDeal(ctx, dealId);
  const d = v.d;
  const sent = d.escalations.filter((e) => e.type === "lawyer_notice" && e.status === "sent").sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1) ?? null;
  let callSlot: string | null = null;
  if (v.phase === "overdue" && sent) {
    const { data: call } = await ctx.db.from("legal_call_bookings").select("slot").eq("deal_id", d.id).neq("status", "cancelled").order("slot", { ascending: false }).limit(1).maybeSingle();
    callSlot = call?.slot ?? null;
  }
  return { v, tax, today, sentNotice: sent, callSlot, claim: sent ? noticeFor(v, ctx.profile, tax).claim : null };
}

/** The legal notice as it would be sent today, with the WhatsApp text and the brand's PDF link. */
export async function noticeView(ctx: ProfileCtx, dealId: string) {
  const { v, tax } = await getDeal(ctx, dealId);
  if (v.phase !== "overdue") fail(409, "This deal has no overdue invoice to send a notice for");
  const d = v.d;
  const n = noticeFor(v, ctx.profile, tax, { fresh: true });
  const link = `${siteUrl()}/api/n/${noticeToken(dealId)}`;
  const text = `Dear ${d.brand.contact_name?.split(" ")[0] || "Sir/Madam"}, please find the legal notice issued on behalf of ${ctx.profile.name} by ${ADVOCATE.name}, Advocate, ${ADVOCATE.firm}, for the unpaid balance of ${inr(n.claim.principal)} under invoice ${d.invoice!.number}.\n\nNotice: ${link}\n\nPlease pay ${inr(n.claim.total)}${n.claim.interest || n.claim.legalFee ? " (including interest and legal costs)" : ""} within ${NOTICE_DAYS} days of receipt, failing which a complaint will be lodged and recovery proceedings started without further notice.`;
  return {
    v, notice: n,
    waHref: d.brand.contact_whatsapp ? waLink(d.brand.contact_whatsapp, text) : null,
    /** Sample deals email the notice to the creator, never the brand. */
    emailTo: d.is_sample ? ctx.profile.email : d.brand.contact_email,
  };
}

async function overdue(ctx: ProfileCtx, dealId: string): Promise<{ v: DealView; tax: Awaited<ReturnType<typeof getDeal>>["tax"] } | null> {
  const { v, tax } = await getDeal(ctx, dealId);
  return v.d.invoice && v.phase === "overdue" ? { v, tax } : null;
}

/** Records that the creator sent the legal notice, and marks the deal escalated. */
async function recordSent(ctx: ProfileCtx, dealId: string, channel: "email" | "whatsapp") {
  const o = await overdue(ctx, dealId);
  if (!o) return;
  const { db } = ctx;
  const { data } = await db.from("escalations").insert({
    deal_id: dealId, type: "lawyer_notice", channel, status: "sent", is_sample: o.v.d.is_sample,
    draft: noticeText(noticeFor(o.v, ctx.profile, o.tax, { fresh: true })),
  }).select("id").single();
  await db.from("deals").update({ status: "escalated" }).eq("id", dealId);
  await audit(db, ctx.user.id, "legal_notice_sent", "escalation", data?.id, { channel });
  await track(ctx, "escalation_opened", { sample: o.v.d.is_sample, props: { type: "lawyer_notice", channel, deal_id: dealId } });
}

/** WhatsApp is click-to-send: the creator presses send; this only logs it. */
export async function logNoticeWhatsApp(ctx: ProfileCtx, dealId: string): Promise<void> {
  await recordSent(ctx, dealId, "whatsapp");
}

/** Emails the notice PDF to the brand. Sample deals go to the creator instead. Returns what happened. */
export async function emailLegalNotice(ctx: ProfileCtx, dealId: string): Promise<string> {
  const o = await overdue(ctx, dealId);
  if (!o) return "This deal has no overdue invoice to send a notice for";
  const { profile } = ctx;
  const d = o.v.d;
  const to = d.is_sample ? profile.email : d.brand.contact_email;
  if (!to) return d.is_sample ? "Add your email in Settings to receive the sample notice" : "Add a contact email for this brand first";

  const n = noticeFor(o.v, profile, o.tax, { fresh: true });
  const pdf = await noticePdf(n);
  const inv = d.invoice!;
  const r = await sendEmail({
    to,
    cc: d.is_sample ? undefined : [d.brand.cc_email, profile.email].filter((x): x is string => !!x),
    replyTo: ADVOCATE.email,
    subject: `Legal notice: unpaid invoice ${inv.number} – ${profile.name}`,
    text: [
      ...(d.is_sample ? ["(Sample deal: this copy came to you instead of the brand.)", ""] : []),
      `Dear ${d.brand.contact_name || "Sir/Madam"},`,
      "",
      `Please find attached a legal notice issued on behalf of my client, ${profile.name}, for the unpaid balance of ${inr(n.claim.principal)} under Tax Invoice No. ${inv.number}.`,
      "",
      `You are called upon to pay ${inr(n.claim.total)}${n.claim.interest || n.claim.legalFee ? ", including interest and legal costs as set out in the notice," : ""} within ${NOTICE_DAYS} days of receipt of this notice, failing which my client will lodge a complaint and initiate recovery proceedings without further notice. Please reply to this email with the payment details.`,
      "",
      "Regards,",
      `${ADVOCATE.name}, Advocate`,
      ADVOCATE.firm,
      `${ADVOCATE.email} · ${ADVOCATE.phones}`,
    ].join("\n"),
    attachments: [{ filename: `Legal notice - ${inv.number.replace(/\//g, "-")}.pdf`, content: pdf }],
  });
  if (!r.sent) return `Email not sent: ${r.reason}`;
  await recordSent(ctx, dealId, "email");
  return d.is_sample ? `Sample deal: notice emailed to you (${to})` : `Notice emailed to ${to}`;
}

/** The creator's PDF of the notice (draft until the advocate issues it). */
export async function noticePdfFor(ctx: ProfileCtx, dealId: string): Promise<{ pdf: Buffer; filename: string }> {
  const { v, tax } = await getDeal(ctx, dealId);
  if (!v.d.invoice || v.remaining <= 0) fail(404, "No unpaid invoice on this deal", "not_found");
  return { pdf: await noticePdf(noticeFor(v, ctx.profile, tax)), filename: `Legal-notice-${v.d.invoice.number.replace(/\//g, "-")}.pdf` };
}

/** MSME Samadhaan: records the intent; the creator files on the government portal themselves. */
export async function startSamadhaan(ctx: ProfileCtx, dealId: string): Promise<void> {
  const { v } = await getDeal(ctx, dealId);
  const { data } = await ctx.db.from("escalations").insert({ deal_id: v.d.id, type: "msme_samadhaan", status: "draft", is_sample: v.d.is_sample }).select("id").single();
  await audit(ctx.db, ctx.user.id, "escalation_created", "escalation", data?.id, { type: "msme_samadhaan" });
  await track(ctx, "escalation_opened", { sample: v.d.is_sample, props: { type: "msme_samadhaan", deal_id: v.d.id } });
}

/** Books a call with the legal team about a deal. Stored only: no payment is taken. */
export async function bookLegalCall(ctx: ProfileCtx, dealId: string, input: LegalCallInput): Promise<{ id: string }> {
  const { v } = await getDeal(ctx, dealId);
  const slot = String(input.slot ?? "");
  const phone = String(input.phone ?? "").trim();
  if (!slot || Number.isNaN(Date.parse(slot)) || Date.parse(slot) < Date.now()) fail(400, "Pick a time slot");
  if (phone.replace(/\D/g, "").length < 10) fail(400, "Enter a phone number the team can call");
  if (!input.consent) fail(400, "Please allow us to share this deal and the notice with the legal team");
  const note = String(input.note ?? "").trim().slice(0, 1000) || null;
  const { data, error } = await ctx.db.from("legal_call_bookings").insert({
    deal_id: v.d.id, slot, phone, note, fee_paise: LEGAL_CALL.feePaise, is_sample: v.d.is_sample,
  }).select("id").single();
  if (error || !data) fail(500, "Could not book: " + error?.message);
  await audit(ctx.db, ctx.user.id, "legal_call_booked", "legal_call_booking", data.id, { slot, deal_id: v.d.id });
  await track(ctx, "legal_call_booked", { sample: v.d.is_sample, props: { deal_id: v.d.id } });
  return { id: data.id };
}

export async function legalCallBooking(ctx: ProfileCtx, id: string): Promise<{ slot: string; phone: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.db.from("legal_call_bookings").select("slot, phone").eq("id", id).maybeSingle();
  return data;
}
