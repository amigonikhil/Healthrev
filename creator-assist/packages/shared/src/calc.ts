// Deal maths. Rates always come from the user's tax_config row; nothing here is
// a hardcoded rate. VERIFY WITH CA: every rule in this file.

export type TaxConfig = {
  gst_rate: number;      // %
  tds_rate: number;      // % — default for new deals; each deal stores its own
  late_interest_rate: number; // %, contractual late-payment interest in agreements, per late_interest_period
  late_interest_period: "week" | "year";
  notice_legal_fee_paise: number; // legal fee claimed in the lawyer notice
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

export type GstMode = "add" | "incl" | "none";

/**
 * Splits the fee the creator typed into taxable value + GST.
 * - add:  fee is before GST; GST goes on top.
 * - incl: fee already includes GST; taxable = fee ÷ (1 + rate), GST = the rest,
 *         so the invoice total equals exactly what was typed.
 * - none: no GST (also forced when the creator isn't registered).
 * VERIFY WITH CA.
 */
export function feeBreakdown(args: {
  feePaise: number; mode: GstMode; creatorStateCode: string; brandStateCode: string | null | undefined;
  rate: number; creatorRegistered: boolean;
}): { taxable: number; gst: GstSplit } {
  const { feePaise, rate } = args;
  if (!args.creatorRegistered || args.mode === "none" || rate <= 0) {
    return { taxable: feePaise, gst: gstSplit(feePaise, args.creatorStateCode, args.brandStateCode, rate, false) };
  }
  if (args.mode === "add") {
    return { taxable: feePaise, gst: gstSplit(feePaise, args.creatorStateCode, args.brandStateCode, rate, true) };
  }
  const taxable = Math.round((feePaise * 100) / (100 + rate));
  const total = feePaise - taxable;
  if (args.brandStateCode && args.brandStateCode !== args.creatorStateCode) {
    return { taxable, gst: { kind: "igst", rate, cgst: 0, sgst: 0, igst: total, total } };
  }
  const cgst = Math.floor(total / 2);
  return { taxable, gst: { kind: "cgst_sgst", rate, cgst, sgst: total - cgst, igst: 0, total } };
}

export type DealSummary = {
  taxable: number;
  gst: GstSplit;
  total: number;
  advance: number;
  tds: number;
  balanceDue: number; // total − advance
  receive: number;    // balanceDue − tds
};

export function dealSummary(args: {
  feePaise: number;
  gstMode: GstMode;
  tdsRate: number;    // 0 = brand doesn't deduct TDS
  advancePaise: number;
  creatorStateCode: string;
  brandStateCode: string | null | undefined;
  creatorRegistered: boolean;
  tax: TaxConfig;
}): DealSummary {
  const { taxable, gst } = feeBreakdown({
    feePaise: args.feePaise, mode: args.gstMode, creatorStateCode: args.creatorStateCode,
    brandStateCode: args.brandStateCode, rate: args.tax.gst_rate, creatorRegistered: args.creatorRegistered,
  });
  const total = taxable + gst.total;
  const tds = tdsEstimate(taxable, args.tdsRate);
  const balanceDue = total - args.advancePaise;
  return { taxable, gst, total, advance: args.advancePaise, tds, balanceDue, receive: balanceDue - tds };
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

/** Contractual late-payment interest: a % rate per week or per year. VERIFY WITH LAWYER. */
export type LateInterest = { rate: number; period: "week" | "year" };
export const lateTerms = (tax: TaxConfig): LateInterest => ({ rate: tax.late_interest_rate, period: tax.late_interest_period });

/** Simple interest on the unpaid amount from the due date, pro rata for part weeks/years. */
export function lateInterest(unpaidPaise: number, daysOverdue: number, li: LateInterest): number {
  if (unpaidPaise <= 0 || daysOverdue <= 0 || li.rate <= 0) return 0;
  return Math.round((unpaidPaise * li.rate * daysOverdue) / 100 / (li.period === "week" ? 7 : 365));
}

/** Reads the rate back out of a signed agreement's late-payment clause. */
export function parseLateClause(text: string | null | undefined): LateInterest | null {
  const m = text?.match(/interest at ([\d.]+)% (a year|per week)/);
  return m ? { rate: Number(m[1]), period: m[2] === "per week" ? "week" : "year" } : null;
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
