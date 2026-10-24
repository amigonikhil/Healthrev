// Deal maths. Rates always come from the user's tax_config row; nothing here is
// a hardcoded rate. VERIFY WITH CA: every rule in this file.

export type TaxConfig = {
  gst_rate: number;      // %
  tds_rate: number;      // %
  rbi_bank_rate: number; // % a year
  msme_multiple: number; // × RBI bank rate
};

export type GstSplit = {
  kind: "igst" | "cgst_sgst" | "none";
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

const pct = (paise: number, rate: number) => Math.round((paise * rate) / 100);

/**
 * GST on a fee. IGST when the brand's state differs from the creator's,
 * otherwise CGST + SGST split equally. An unregistered creator (no GSTIN)
 * charges no GST.
 * VERIFY WITH CA: place of supply rules for services to registered/unregistered recipients.
 */
export function gstSplit(
  feePaise: number,
  creatorStateCode: string,
  brandStateCode: string | null | undefined,
  rate: number,
  creatorRegistered: boolean,
): GstSplit {
  if (!creatorRegistered || rate <= 0) {
    return { kind: "none", rate: 0, cgst: 0, sgst: 0, igst: 0, total: 0 };
  }
  if (brandStateCode && brandStateCode !== creatorStateCode) {
    const igst = pct(feePaise, rate);
    return { kind: "igst", rate, cgst: 0, sgst: 0, igst, total: igst };
  }
  const half = pct(feePaise, rate / 2);
  return { kind: "cgst_sgst", rate, cgst: half, sgst: half, igst: 0, total: half * 2 };
}

/** TDS a brand is expected to deduct: on the fee, not on the GST. VERIFY WITH CA. */
export const tdsEstimate = (feePaise: number, tdsRate: number) => pct(feePaise, tdsRate);

export type DealSummary = {
  fee: number;
  gst: GstSplit;
  total: number;
  advance: number;
  tds: number;
  balanceDue: number; // total − advance
  receive: number;    // balanceDue − tds
};

export function dealSummary(args: {
  feePaise: number;
  advancePaise: number;
  creatorStateCode: string;
  brandStateCode: string | null | undefined;
  creatorRegistered: boolean;
  tax: TaxConfig;
}): DealSummary {
  const gst = gstSplit(args.feePaise, args.creatorStateCode, args.brandStateCode, args.tax.gst_rate, args.creatorRegistered);
  const total = args.feePaise + gst.total;
  const tds = tdsEstimate(args.feePaise, args.tax.tds_rate);
  const balanceDue = total - args.advancePaise;
  return { fee: args.feePaise, gst, total, advance: args.advancePaise, tds, balanceDue, receive: balanceDue - tds };
}

/** Annual MSME interest rate in % (multiple × RBI bank rate). VERIFY WITH CA. */
export const msmeAnnualRate = (tax: TaxConfig) => tax.msme_multiple * tax.rbi_bank_rate;

/**
 * Interest on a delayed payment under MSMED Act s.16: compound interest with
 * monthly rests at msme_multiple × RBI bank rate. Whole months compound; the
 * remaining days accrue simple interest on the compounded amount.
 * VERIFY WITH CA.
 */
export function msmeInterest(unpaidPaise: number, daysOverdue: number, tax: TaxConfig): number {
  if (unpaidPaise <= 0 || daysOverdue <= 0) return 0;
  const annual = msmeAnnualRate(tax) / 100;
  const months = Math.floor(daysOverdue / 30);
  const rest = daysOverdue - months * 30;
  const compounded = unpaidPaise * Math.pow(1 + annual / 12, months);
  const withRest = compounded * (1 + (annual * rest) / 365);
  return Math.round(withRest - unpaidPaise);
}

/**
 * Split a fee across weighted invoice lines so the lines sum exactly to the
 * fee. Lines with weight 0 are shown as "Included".
 */
export function allocate(feePaise: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.map((_, i) => (i === 0 ? feePaise : 0));
  // Allocate whole rupees; the largest line absorbs rounding.
  const out = weights.map((w) => Math.floor((feePaise * w) / total / 100) * 100);
  const diff = feePaise - out.reduce((a, b) => a + b, 0);
  let big = 0;
  weights.forEach((w, i) => { if (w > weights[big]) big = i; });
  out[big] += diff;
  return out;
}
