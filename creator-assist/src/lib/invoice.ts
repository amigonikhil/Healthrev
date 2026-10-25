import { allocate, feeBreakdown, type GstMode, type TaxConfig } from "./calc";
import { addDays, fyOf } from "./dates";
import { findDeliverable, invoiceLineLabel, usageDurationLabel } from "./deliverables";
import type { DealDeliverable, InvoiceLine, Profile, UsageRights } from "./types";

// SAC 998361: advertising services. VERIFY WITH CA for each creator's services.
export const SAC = "998361";

export type InvoiceDraft = {
  invoice_date: string; due_date: string; fy: string;
  taxable_paise: number; cgst_paise: number; sgst_paise: number; igst_paise: number; gst_rate: number;
  total_paise: number; advance_deducted_paise: number; balance_due_paise: number; tds_rate: number;
  lines: InvoiceLine[];
};

export function buildInvoice(args: {
  profile: Profile; tax: TaxConfig; brandStateCode: string | null;
  fee: number; gstMode: GstMode; tdsRate: number; advanceReceived: number; termsDays: number; invoiceDate: string;
  deliverables: Pick<DealDeliverable, "platform" | "type" | "quantity">[]; usage: UsageRights | null;
}): InvoiceDraft {
  const { taxable, gst } = feeBreakdown({
    feePaise: args.fee, mode: args.gstMode, creatorStateCode: args.profile.state_code,
    brandStateCode: args.brandStateCode, rate: args.tax.gst_rate, creatorRegistered: !!args.profile.gstin,
  });
  const weights = args.deliverables.map((d) => (findDeliverable(d.platform, d.type)?.weight ?? 1) * (d.type === "Link in bio" ? 1 : d.quantity));
  const amounts = args.deliverables.length ? allocate(taxable, weights) : [taxable];
  const lines: InvoiceLine[] = args.deliverables.length
    ? args.deliverables.map((d, i) => ({ label: invoiceLineLabel(d), sac: SAC, amount_paise: amounts[i], included: amounts[i] === 0 }))
    : [{ label: "Content creation services", sac: SAC, amount_paise: taxable }];
  if (args.usage?.enabled) {
    lines.push({ label: `Usage rights, ${usageDurationLabel(args.usage.duration).toLowerCase()}`, sac: SAC, amount_paise: 0, included: true });
  }
  const total = taxable + gst.total;
  return {
    invoice_date: args.invoiceDate,
    due_date: addDays(args.invoiceDate, args.termsDays),
    fy: fyOf(args.invoiceDate),
    taxable_paise: taxable,
    cgst_paise: gst.cgst, sgst_paise: gst.sgst, igst_paise: gst.igst, gst_rate: gst.rate,
    total_paise: total,
    advance_deducted_paise: args.advanceReceived,
    balance_due_paise: total - args.advanceReceived,
    tds_rate: args.tdsRate,
    lines,
  };
}

export const invoiceNumber = (prefix: string, fy: string, seq: number) => `${prefix}/${fy}/${String(seq).padStart(3, "0")}`;

/** Initials for the default invoice prefix: "Ravi Teja K" → "RTK". */
export function defaultPrefix(name: string): string {
  const p = name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).join("").replace(/[^A-Z]/g, "").slice(0, 4);
  return p.length >= 2 ? p : (name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "INV");
}
