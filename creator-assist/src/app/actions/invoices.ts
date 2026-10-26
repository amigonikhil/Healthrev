"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getTax, loadDeal, requireProfile } from "@/lib/data";
import { fmtDate, todayIST } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { buildInvoice, invoiceNumber } from "@/lib/invoice";
import { billToName, nextInvoiceSeq, renderInvoicePdf } from "@/lib/invoice-data";
import { inr } from "@/lib/money";
import { everyHours, reminderSlots } from "@/lib/reminder-schedule";
import type { Invoice } from "@/lib/types";
import { track } from "@/lib/events";

export type InvState = { error?: string } | undefined;

export async function generateInvoice(dealId: string, _: InvState, f: FormData): Promise<InvState> {
  const { db, user, profile } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.invoice) redirect(`/deals/${dealId}/invoice`);
  const date = String(f.get("invoice_date") || todayIST());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose an invoice date" };

  const tax = await getTax(db);
  const draft = buildInvoice({
    profile, tax, brandStateCode: deal.brand.state_code, fee: deal.fee_paise, gstMode: deal.gst_mode, tdsRate: Number(deal.tds_rate),
    advanceReceived: deal.advance_received_at ? deal.advance_paise : 0, termsDays: deal.terms_days,
    invoiceDate: date, deliverables: deal.deliverables, usage: deal.usage,
  });

  // Number = next in this financial year; retry once if two tabs race.
  let invoice: Invoice | null = null;
  for (let attempt = 0; attempt < 3 && !invoice; attempt++) {
    const seq = await nextInvoiceSeq(db, draft.fy);
    const { data, error } = await db.from("invoices").insert({
      deal_id: deal.id, number: invoiceNumber(profile.invoice_prefix, draft.fy, seq), seq, ...draft, is_sample: deal.is_sample,
    }).select("*").single<Invoice>();
    if (data) invoice = data;
    else if (error?.code !== "23505") return { error: "Could not create the invoice: " + error?.message };
  }
  if (!invoice) return { error: "Could not number the invoice. Try again." };

  await db.from("deals").update({ status: "invoiced" }).eq("id", deal.id);
  // Payment reminders: 3, every N hours (Settings) from the due date, 9:00 IST.
  await db.from("reminders").insert(reminderSlots(invoice.due_date, everyHours(profile.remind_every_hours)).map((s) => ({
    deal_id: deal.id, kind: "payment", stage: s.stage, channel: "email", language: profile.language,
    scheduled_at: s.at, is_sample: deal.is_sample,
  })));
  await audit(db, user.id, "invoice_generated", "invoice", invoice.id, { number: invoice.number, total_paise: invoice.total_paise });
  await track(user.id, "invoice_generated", { sample: deal.is_sample, props: { deal_id: deal.id } });

  let toast = `Invoice ${invoice.number} created`;
  if (f.get("email") === "on") {
    const r = await emailInvoice(invoice.id);
    toast = r;
  }
  redirect(`/deals/${deal.id}/invoice?t=${encodeURIComponent(toast)}`);
}

/** Emails the invoice PDF to the brand contact. Returns a toast message. */
export async function emailInvoice(invoiceId: string): Promise<string> {
  const { db, user, profile } = await requireProfile();
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoiceId).single<Invoice>();
  if (!inv) return "Invoice not found";
  const deal = await loadDeal(db, inv.deal_id);
  if (!deal) return "Deal not found";
  if (deal.is_sample) return "Sample deal: invoice not actually emailed";
  if (!deal.brand.contact_email) return "Add a contact email for this brand first";

  const pdf = await renderInvoicePdf(inv, profile, deal);
  const r = await sendEmail({
    to: deal.brand.contact_email, cc: deal.brand.cc_email ? [deal.brand.cc_email] : undefined, replyTo: profile.email ?? undefined,
    subject: `Invoice ${inv.number} from ${profile.name}`,
    text: `Hi ${deal.brand.contact_name || "there"},\n\nPlease find attached invoice ${inv.number} for ${billToName(deal)}: ${inr(inv.total_paise)}${inv.advance_deducted_paise ? `, less the ${inr(inv.advance_deducted_paise)} advance received` : ""}. Balance due ${inr(inv.balance_due_paise)} by ${fmtDate(inv.due_date)}.\n\nThank you!\n– ${profile.name}`,
    attachments: [{ filename: `${inv.number.replace(/\//g, "-")}.pdf`, content: pdf }],
  });
  if (r.sent) { await audit(db, user.id, "invoice_sent", "invoice", inv.id); await track(user.id, "invoice_sent", { props: { deal_id: deal.id } }); }
  return r.sent ? `Invoice emailed to ${deal.brand.contact_email}` : `Email not sent: ${r.reason}`;
}
