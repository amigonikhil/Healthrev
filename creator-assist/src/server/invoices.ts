import "server-only";
import type { GenerateInvoiceInput, RecordPaymentInput, RecordPaymentResult } from "@creator-assist/shared/api";
import { addDays, fmtDate, nineAmIST, todayIST } from "@creator-assist/shared/dates";
import type { DealView } from "@creator-assist/shared/deal-view";
import { buildInvoice, invoiceNumber, type InvoiceDraft } from "@creator-assist/shared/invoice";
import { form16aMessage } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import { everyHours, reminderSlots } from "@creator-assist/shared/reminder-schedule";
import type { Invoice } from "@creator-assist/shared/types";
import { audit } from "@/lib/audit";
import { loadDeal } from "@/lib/data";
import { sendEmail } from "@/lib/email";
import { billToName, nextInvoiceSeq, renderInvoicePdf } from "@/lib/invoice-data";
import { fail, track, type ProfileCtx } from "./context";
import { getDeal } from "./deals";

export type InvoiceShown = (Invoice | (InvoiceDraft & { number: string })) & { draft: boolean };

/** The deal's invoice, or a numbered-later preview of what generating it would produce. */
export async function invoiceView(ctx: ProfileCtx, dealId: string): Promise<{ v: DealView; invoice: InvoiceShown; billTo: string }> {
  const { v, tax, today } = await getDeal(ctx, dealId);
  const d = v.d;
  const invoice: InvoiceShown = d.invoice
    ? { ...d.invoice, draft: false }
    : {
        ...buildInvoice({
          profile: ctx.profile, tax, brandStateCode: d.brand.state_code, fee: d.fee_paise, gstMode: d.gst_mode, tdsRate: Number(d.tds_rate),
          advanceReceived: d.advance_received_at ? d.advance_paise : 0, termsDays: d.terms_days,
          invoiceDate: d.go_live_date && d.go_live_date <= today ? d.go_live_date : today, deliverables: d.deliverables, usage: d.usage,
        }),
        number: "Draft", draft: true,
      };
  return { v, invoice, billTo: billToName(d) };
}

/** Numbers the invoice (next in this financial year), starts the reminder ladder and optionally emails it. */
export async function generateInvoice(ctx: ProfileCtx, dealId: string, input: GenerateInvoiceInput): Promise<{ invoice: Invoice; message: string; existed: boolean }> {
  const { db, profile } = ctx;
  const { v, tax } = await getDeal(ctx, dealId);
  const deal = v.d;
  if (deal.invoice) return { invoice: deal.invoice, message: `Invoice ${deal.invoice.number} already exists`, existed: true };
  const date = String(input.invoiceDate || todayIST());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "Choose an invoice date");

  const draft = buildInvoice({
    profile, tax, brandStateCode: deal.brand.state_code, fee: deal.fee_paise, gstMode: deal.gst_mode, tdsRate: Number(deal.tds_rate),
    advanceReceived: deal.advance_received_at ? deal.advance_paise : 0, termsDays: deal.terms_days,
    invoiceDate: date, deliverables: deal.deliverables, usage: deal.usage,
  });

  // Number = next in this financial year; retry if two requests race for it.
  let invoice: Invoice | null = null;
  for (let attempt = 0; attempt < 3 && !invoice; attempt++) {
    const seq = await nextInvoiceSeq(db, draft.fy);
    const { data, error } = await db.from("invoices").insert({
      deal_id: deal.id, number: invoiceNumber(profile.invoice_prefix, draft.fy, seq), seq, ...draft, is_sample: deal.is_sample,
    }).select("*").single<Invoice>();
    if (data) invoice = data;
    else if (error?.code !== "23505") fail(500, "Could not create the invoice: " + error?.message);
  }
  if (!invoice) fail(503, "Could not number the invoice. Try again.");

  await db.from("deals").update({ status: "invoiced" }).eq("id", deal.id);
  // Payment reminders: 3, every N hours (Settings) from the due date, 9:00 IST.
  await db.from("reminders").insert(reminderSlots(invoice.due_date, everyHours(profile.remind_every_hours)).map((s) => ({
    deal_id: deal.id, kind: "payment", stage: s.stage, channel: "email", language: profile.language,
    scheduled_at: s.at, is_sample: deal.is_sample,
  })));
  await audit(db, ctx.user.id, "invoice_generated", "invoice", invoice.id, { number: invoice.number, total_paise: invoice.total_paise });
  await track(ctx, "invoice_generated", { sample: deal.is_sample, props: { deal_id: deal.id } });

  const message = input.email ? await emailInvoice(ctx, invoice.id) : `Invoice ${invoice.number} created`;
  return { invoice, message, existed: false };
}

/** Emails the invoice PDF to the brand contact. Returns what happened, for a toast. */
export async function emailInvoice(ctx: ProfileCtx, invoiceId: string): Promise<string> {
  const { db, profile } = ctx;
  const { data: inv } = await db.from("invoices").select("*").eq("id", invoiceId).maybeSingle<Invoice>();
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
  if (r.sent) {
    await audit(db, ctx.user.id, "invoice_sent", "invoice", inv.id);
    await track(ctx, "invoice_sent", { props: { deal_id: deal.id } });
  }
  return r.sent ? `Invoice emailed to ${deal.brand.contact_email}` : `Email not sent: ${r.reason}`;
}

export async function invoicePdf(ctx: ProfileCtx, invoiceId: string): Promise<{ pdf: Buffer; filename: string }> {
  const { data: inv } = await ctx.db.from("invoices").select("*").eq("id", invoiceId).maybeSingle<Invoice>();
  if (!inv) fail(404, "Invoice not found", "not_found");
  const deal = await loadDeal(ctx.db, inv.deal_id);
  if (!deal) fail(404, "Invoice not found", "not_found");
  return { pdf: await renderInvoicePdf(inv, ctx.profile, deal), filename: `${inv.number.replace(/\//g, "-")}.pdf` };
}

/** Records money received (and TDS deducted). A full payment settles the deal and cancels pending reminders. */
export async function recordPayment(ctx: ProfileCtx, dealId: string, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const { db, profile } = ctx;
  const { v } = await getDeal(ctx, dealId);
  const deal = v.d;
  if (!deal.invoice) fail(409, "Generate the invoice before recording a payment");
  const inv = deal.invoice;

  const amount = input.amountPaise;
  const tds = input.tdsPaise ?? 0;
  const date = input.receivedOn || todayIST();
  if (!Number.isFinite(amount) || amount < 0) fail(400, "Enter the amount received");
  if (!Number.isFinite(tds) || tds < 0) fail(400, "TDS should be a number (0 if none)");
  if (amount + tds <= 0) fail(400, "Enter the amount received or TDS");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) fail(400, "Date received can't be in the future");

  const paidBefore = inv.payments.reduce((a, p) => a + p.amount_paise + p.tds_paise, 0);
  const remaining = inv.balance_due_paise - paidBefore - amount - tds;

  const { data: pay, error } = await db.from("payments").insert({
    invoice_id: inv.id, amount_paise: amount, tds_paise: tds, received_on: date, utr: (input.utr ?? "").trim() || null, is_sample: deal.is_sample,
  }).select("id").single();
  if (error || !pay) fail(500, "Could not save the payment: " + error?.message);

  const settled = remaining <= 0;
  await db.from("deals").update({ status: settled ? "paid" : "partially_paid" }).eq("id", deal.id);
  if (settled) {
    // Saving a full payment cancels any reminders still waiting to go out.
    await db.from("reminders").update({ cancelled_at: new Date().toISOString() })
      .eq("deal_id", deal.id).eq("kind", "payment").is("sent_at", null).is("cancelled_at", null);
  }
  if (tds > 0 && input.form16a) {
    await db.from("reminders").insert({
      deal_id: deal.id, kind: "tds", stage: "form16a", channel: "email", language: profile.language, is_sample: deal.is_sample,
      message: form16aMessage({ contact: deal.brand.contact_name ?? "", amount: tds, invoiceNo: inv.number, creator: profile.name }),
      scheduled_at: nineAmIST(addDays(todayIST(), 7)),
    });
  }
  await audit(db, ctx.user.id, "payment_recorded", "payment", pay.id, { amount_paise: amount, tds_paise: tds, settled });
  await track(ctx, "payment_recorded", { sample: deal.is_sample, props: { deal_id: deal.id, settled } });
  return { settled, tdsPaise: tds };
}
