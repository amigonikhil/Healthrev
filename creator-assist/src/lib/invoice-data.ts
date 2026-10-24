import "server-only";
import { decrypt } from "./crypto";
import type { DB } from "./supabase/server";
import type { Brand, DealFull, Invoice, Profile } from "./types";
import { invoicePdf } from "./pdf";

export const billToName = (d: DealFull) =>
  d.paid_by === "agency" && d.brand.agency_name ? `${d.brand.agency_name} (for ${d.brand.name})` : d.brand.legal_name || d.brand.name;

export async function renderInvoicePdf(invoice: Invoice, profile: Profile, deal: DealFull | { brand: Brand; paid_by: string; advance_received_at: string | null }) {
  return invoicePdf({
    invoice, profile, brand: deal.brand,
    billTo: billToName(deal as DealFull),
    acct: decrypt(profile.bank_account_enc),
    advanceDate: deal.advance_received_at,
  });
}

export async function nextInvoiceSeq(db: DB, fy: string): Promise<number> {
  const { data } = await db.from("invoices").select("seq").eq("fy", fy).order("seq", { ascending: false }).limit(1).maybeSingle();
  return (data?.seq ?? 0) + 1;
}
