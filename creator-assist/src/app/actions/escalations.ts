"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADVOCATE, LEGAL_CALL, NOTICE_DAYS } from "@/lib/advocate";
import { audit } from "@/lib/audit";
import { getTax, loadDeal, requireProfile } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { viewDeal } from "@/lib/deal-view";
import { sendEmail } from "@/lib/email";
import { inr } from "@/lib/money";
import { noticeText } from "@/lib/notice";
import { noticeFor } from "@/lib/notice-data";
import { noticePdf } from "@/lib/notice-pdf";
import { track } from "@/lib/events";

async function loadOverdue(dealId: string) {
  const { db, user, profile } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal?.invoice) return null;
  const tax = await getTax(db);
  const v = viewDeal(deal, profile, tax, todayIST());
  return v.phase === "overdue" ? { db, user, profile, tax, v } : null;
}

/** Records that the creator sent the legal notice, and marks the deal escalated. */
async function recordSent(dealId: string, channel: "email" | "whatsapp") {
  const ctx = await loadOverdue(dealId);
  if (!ctx) return;
  const { db, user, profile, tax, v } = ctx;
  const { data } = await db.from("escalations").insert({
    deal_id: dealId, type: "lawyer_notice", channel, status: "sent", is_sample: v.d.is_sample,
    draft: noticeText(noticeFor(v, profile, tax, { fresh: true })),
  }).select("id").single();
  await db.from("deals").update({ status: "escalated" }).eq("id", dealId);
  await audit(db, user.id, "legal_notice_sent", "escalation", data?.id, { channel });
  await track(user.id, "escalation_opened", { sample: v.d.is_sample, props: { type: "lawyer_notice", channel, deal_id: dealId } });
  revalidatePath(`/deals/${dealId}`);
}

/** WhatsApp is click-to-send: the creator presses send; this only logs it. */
export async function logNoticeWhatsApp(dealId: string) {
  await recordSent(dealId, "whatsapp");
}

/** Emails the notice PDF to the brand. Sample deals go to the creator instead. */
export async function emailLegalNotice(dealId: string): Promise<string> {
  const ctx = await loadOverdue(dealId);
  if (!ctx) return "This deal has no overdue invoice to send a notice for";
  const { profile, tax, v } = ctx;
  const d = v.d;
  const to = d.is_sample ? profile.email : d.brand.contact_email;
  if (!to) return d.is_sample ? "Add your email in Settings to receive the sample notice" : "Add a contact email for this brand first";

  const n = noticeFor(v, profile, tax, { fresh: true });
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
  await recordSent(dealId, "email");
  return d.is_sample ? `Sample deal: notice emailed to you (${to})` : `Notice emailed to ${to}`;
}

/** MSME Samadhaan: records the intent; the creator files on the government portal themselves. */
export async function startSamadhaan(dealId: string) {
  const { db, user } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal) return;
  const { data } = await db.from("escalations").insert({ deal_id: deal.id, type: "msme_samadhaan", status: "draft", is_sample: deal.is_sample }).select("id").single();
  await audit(db, user.id, "escalation_created", "escalation", data?.id, { type: "msme_samadhaan" });
  await track(user.id, "escalation_opened", { sample: deal.is_sample, props: { type: "msme_samadhaan", deal_id: deal.id } });
}

export type CallState = { error?: string } | undefined;

/** Books a 15-minute call with the legal team about a deal. Beta: stored only, no payment. */
export async function bookLegalCall(dealId: string, _: CallState, f: FormData): Promise<CallState> {
  const { db, user } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal) return { error: "Deal not found" };
  const slot = String(f.get("slot") ?? "");
  const phone = String(f.get("phone") ?? "").trim();
  if (!slot || Number.isNaN(Date.parse(slot)) || Date.parse(slot) < Date.now()) return { error: "Pick a time slot" };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Enter a phone number the team can call" };
  if (f.get("consent") !== "on") return { error: "Please allow us to share this deal and the notice with the legal team" };
  const note = String(f.get("note") ?? "").trim().slice(0, 1000) || null;
  const { data, error } = await db.from("legal_call_bookings").insert({
    deal_id: deal.id, slot, phone, note, fee_paise: LEGAL_CALL.feePaise, is_sample: deal.is_sample,
  }).select("id").single();
  if (error || !data) return { error: "Could not book: " + error?.message };
  await audit(db, user.id, "legal_call_booked", "legal_call_booking", data.id, { slot, deal_id: deal.id });
  await track(user.id, "legal_call_booked", { sample: deal.is_sample, props: { deal_id: deal.id } });
  redirect(`/deals/${deal.id}/legal-call/booked?b=${data.id}`);
}
