import "server-only";
import { decrypt } from "./crypto";
import type { DB } from "./supabase/server";
import type { DealFull, Invoice, Payment, Profile } from "@creator-assist/shared/types";
import { todayIST } from "@creator-assist/shared/dates";
import { invoicePdf } from "./invoice-pdf";
import { nextInvoiceSeq as nextSeq } from "@creator-assist/shared/invoice";

export const billToName = (d: DealFull) =>
  d.paid_by === "agency" && d.brand.agency_name ? `${d.brand.agency_name} (for ${d.brand.name})` : d.brand.legal_name || d.brand.name;

export async function renderInvoicePdf(invoice: Invoice, profile: Profile, deal: DealFull) {
  const payments: Payment[] = deal.invoice?.id === invoice.id ? deal.invoice.payments : [];
  return invoicePdf({
    invoice, profile, brand: deal.brand,
    billTo: billToName(deal),
    acct: decrypt(profile.bank_account_enc),
    pan: decrypt(profile.pan_enc),
    advanceDate: deal.advance_received_at,
    payments,
    today: todayIST(),
  });
}

export async function nextInvoiceSeq(db: DB, fy: string): Promise<number> {
  const { data } = await db.from("invoices").select("seq").eq("fy", fy).order("seq", { ascending: false }).limit(1).maybeSingle();
  return nextSeq(data?.seq);
}
