// One test group per calculation the web and mobile apps share: GST, advance, TDS,
// balance, MSME interest and invoice numbering. Expected values are worked out by
// hand in the comments so a failure says which rule broke. VERIFY WITH CA.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dealSummary, feeBreakdown, gstSplit, msmeAnnualRate, msmeInterest, tdsEstimate, type TaxConfig } from "./calc.ts";
import { fyOf } from "./dates.ts";
import { dealAmounts, sumAmounts, viewDeal } from "./deal-view.ts";
import { buildInvoice, defaultPrefix, invoiceNumber, nextInvoiceSeq } from "./invoice.ts";
import type { DealFull, Invoice, Payment, Profile } from "./types.ts";

const tax: TaxConfig = { gst_rate: 18, tds_rate: 10, rbi_bank_rate: 5.5, msme_multiple: 3, late_interest_rate: 10, late_interest_period: "week", notice_legal_fee_paise: 500000 };
const R = (rupees: number) => rupees * 100; // paise

// ------------------------------------------------------------------ GST
test("GST: other state → IGST at the full rate", () => {
  const g = gstSplit(R(45000), "36", "29", 18, true);
  assert.deepEqual(g, { kind: "igst", rate: 18, cgst: 0, sgst: 0, igst: R(8100), total: R(8100) });
});

test("GST: same state → CGST + SGST, half the rate each", () => {
  const g = gstSplit(R(12000), "36", "36", 18, true);
  assert.deepEqual(g, { kind: "cgst_sgst", rate: 18, cgst: R(1080), sgst: R(1080), igst: 0, total: R(2160) });
});

test("GST: brand state unknown → treated as same state (CGST + SGST)", () => {
  assert.equal(gstSplit(R(10000), "36", null, 18, true).kind, "cgst_sgst");
});

test("GST: none for unregistered creators, zero rate or 'No GST'", () => {
  assert.equal(gstSplit(R(10000), "36", "29", 18, false).total, 0);
  assert.equal(gstSplit(R(10000), "36", "29", 0, true).total, 0);
  const b = feeBreakdown({ feePaise: R(10000), mode: "none", creatorStateCode: "36", brandStateCode: "29", rate: 18, creatorRegistered: true });
  assert.deepEqual([b.taxable, b.gst.total], [R(10000), 0]);
});

test("GST: 'incl. GST' backs GST out so the invoice total is exactly what was typed", () => {
  // ₹59,000 incl. 18% → taxable 50,000 + IGST 9,000
  const b = feeBreakdown({ feePaise: R(59000), mode: "incl", creatorStateCode: "36", brandStateCode: "29", rate: 18, creatorRegistered: true });
  assert.deepEqual([b.taxable, b.gst.igst, b.taxable + b.gst.total], [R(50000), R(9000), R(59000)]);
  // Odd amount, same state: halves can differ by a paisa but still add up.
  const c = feeBreakdown({ feePaise: 1_000_001, mode: "incl", creatorStateCode: "36", brandStateCode: "36", rate: 18, creatorRegistered: true });
  assert.equal(c.taxable + c.gst.cgst + c.gst.sgst, 1_000_001);
  assert.ok(Math.abs(c.gst.cgst - c.gst.sgst) <= 1);
});

// ------------------------------------------------------------------ TDS
test("TDS: on the fee, never on the GST", () => {
  // ₹45,000 + ₹8,100 IGST: 10% TDS is ₹4,500, not ₹5,310.
  const s = dealSummary({ feePaise: R(45000), gstMode: "add", tdsRate: 10, advancePaise: 0, creatorStateCode: "36", brandStateCode: "29", creatorRegistered: true, tax });
  assert.equal(s.tds, R(4500));
});

test("TDS: on the taxable value when the fee includes GST; off when the brand doesn't deduct", () => {
  const incl = dealSummary({ feePaise: R(59000), gstMode: "incl", tdsRate: 10, advancePaise: 0, creatorStateCode: "36", brandStateCode: "29", creatorRegistered: true, tax });
  assert.equal(incl.tds, R(5000));
  const none = dealSummary({ feePaise: R(59000), gstMode: "incl", tdsRate: 0, advancePaise: 0, creatorStateCode: "36", brandStateCode: "29", creatorRegistered: true, tax });
  assert.equal(none.tds, 0);
});

test("TDS: rounds to the nearest paisa (2% on ₹1,234.56 = ₹24.69)", () => {
  assert.equal(tdsEstimate(123456, 2), 2469);
});

// ------------------------------------------------------------------ Advance and balance
test("Advance: comes off the invoice total; TDS comes off the balance", () => {
  // Voltra: 45,000 + 8,100 IGST = 53,100 − 15,000 advance = 38,100 due; − 4,500 TDS = 33,600 to the bank.
  const s = dealSummary({ feePaise: R(45000), gstMode: "add", tdsRate: 10, advancePaise: R(15000), creatorStateCode: "36", brandStateCode: "29", creatorRegistered: true, tax });
  assert.deepEqual([s.total, s.advance, s.balanceDue, s.receive], [R(53100), R(15000), R(38100), R(33600)]);
});

test("Advance: invoice deducts only the advance already received", () => {
  const profile = { state_code: "36", gstin: "36ABCDE1234F1Z5" } as Profile;
  const base = { profile, tax, brandStateCode: "29", fee: R(45000), gstMode: "add" as const, tdsRate: 10, termsDays: 45, invoiceDate: "2026-08-26",
    deliverables: [{ platform: "Instagram", type: "Reel", quantity: 2 }, { platform: "Instagram", type: "Story", quantity: 3 }], usage: null };
  const withAdv = buildInvoice({ ...base, advanceReceived: R(15000) });
  assert.deepEqual([withAdv.total_paise, withAdv.advance_deducted_paise, withAdv.balance_due_paise], [R(53100), R(15000), R(38100)]);
  const noAdv = buildInvoice({ ...base, advanceReceived: 0 });
  assert.equal(noAdv.balance_due_paise, R(53100));
  // Lines add up to the taxable value; due date = invoice date + terms.
  assert.equal(withAdv.lines.reduce((a, l) => a + l.amount_paise, 0), withAdv.taxable_paise);
  assert.equal(withAdv.due_date, "2026-10-10");
});

const deal = (over: { advance?: number; advanceReceived?: boolean; payments?: Pick<Payment, "amount_paise" | "tds_paise" | "received_on">[]; dueDate?: string; invoiced?: boolean } = {}): DealFull => {
  const inv = buildInvoice({
    profile: { state_code: "36", gstin: "36X" } as Profile, tax, brandStateCode: "29", fee: R(45000), gstMode: "add", tdsRate: 10,
    advanceReceived: over.advanceReceived === false ? 0 : over.advance ?? 0, termsDays: 45, invoiceDate: "2026-08-26", deliverables: [], usage: null,
  });
  return {
    id: "d1", user_id: "u", brand_id: "b", paid_by: "brand", fee_paise: R(45000), advance_paise: over.advance ?? 0,
    advance_received_at: over.advance && over.advanceReceived !== false ? "2026-08-20" : null, go_live_date: null, terms_days: 45,
    status: "invoiced", is_sample: false, created_at: "", updated_at: "", gst_mode: "add", tds_rate: 10,
    brand: { id: "b", name: "Voltra", state_code: "29" } as DealFull["brand"], deliverables: [], usage: null, agreement: null, reminders: [], escalations: [],
    invoice: over.invoiced === false ? null : {
      ...inv, id: "i1", deal_id: "d1", number: "RTK/2026-27/014", seq: 14, is_sample: false, created_at: "",
      due_date: over.dueDate ?? inv.due_date,
      payments: (over.payments ?? []).map((p, i) => ({ id: `p${i}`, invoice_id: "i1", utr: null, is_sample: false, ...p })),
    } as Invoice & { payments: Payment[] },
  };
};
const creator = { state_code: "36", gstin: "36X", udyam_no: "UDYAM-TS-02-0012345", remind_every_hours: 8 } as Profile;

test("Balance: due and after-TDS amounts on an invoiced deal with an advance", () => {
  const v = viewDeal(deal({ advance: R(15000) }), creator, tax, "2026-09-01");
  assert.deepEqual(dealAmounts(v), { label: "due", due: R(38100), afterTds: R(33600) });
});

test("Balance: a part payment (with its TDS) reduces both numbers", () => {
  // Brand pays ₹18,000 and deducts ₹2,000 TDS: 38,100 − 20,000 = 18,100 still due; TDS left 2,500 → 15,600 to come.
  const v = viewDeal(deal({ advance: R(15000), payments: [{ amount_paise: R(18000), tds_paise: R(2000), received_on: "2026-09-01" }] }), creator, tax, "2026-09-02");
  assert.deepEqual(dealAmounts(v), { label: "due", due: R(18100), afterTds: R(15600) });
});

test("Balance: fully paid shows what was paid; nothing is due", () => {
  const v = viewDeal(deal({ payments: [{ amount_paise: R(48600), tds_paise: R(4500), received_on: "2026-09-10" }] }), creator, tax, "2026-09-11");
  assert.equal(v.phase, "paid");
  assert.deepEqual(dealAmounts(v), { label: "paid", due: R(53100), afterTds: R(48600) });
});

test("Balance: not invoiced yet uses the agreed advance even before it arrives", () => {
  const v = viewDeal(deal({ invoiced: false, advance: R(15000), advanceReceived: false }), creator, tax, "2026-08-21");
  assert.deepEqual(dealAmounts(v), { label: "due", due: R(38100), afterTds: R(33600) });
});

test("Balance: Home totals are the sum of each deal's numbers", () => {
  const a = viewDeal(deal({ advance: R(15000) }), creator, tax, "2026-09-01");
  const b = viewDeal(deal(), creator, tax, "2026-09-01");
  assert.deepEqual(sumAmounts([a, b]), { due: R(38100) + R(53100), afterTds: R(33600) + R(48600) });
});

// ------------------------------------------------------------------ MSME interest
test("MSME interest: annual rate is the multiple × RBI bank rate", () => {
  assert.equal(msmeAnnualRate(tax), 16.5);
});

test("MSME interest: nothing until overdue, nothing on nothing", () => {
  assert.equal(msmeInterest(R(38100), 0, tax), 0);
  assert.equal(msmeInterest(0, 30, tax), 0);
});

test("MSME interest: simple for part of a month, compounded monthly after that", () => {
  // 18 days: 38,100 × 16.5% × 18/365 = ₹310.019 → ₹310.02
  assert.equal(msmeInterest(R(38100), 18, tax), 31002);
  // 60 days = 2 monthly rests: 1,00,000 × (1 + 0.165/12)² − 1,00,000 = ₹2,768.91
  assert.equal(msmeInterest(R(100000), 60, tax), 276891);
  assert.ok(msmeInterest(R(100000), 60, tax) > Math.round(R(100000) * 0.165 * 60 / 365), "compounding beats simple interest");
});

test("MSME interest: only for Udyam-registered creators, and only on overdue deals", () => {
  const overdue = deal({ advance: R(15000), dueDate: "2026-10-10" });
  assert.equal(viewDeal(overdue, creator, tax, "2026-10-28").interest, 31002);
  assert.equal(viewDeal(overdue, { ...creator, udyam_no: null }, tax, "2026-10-28").interest, 0);
  assert.equal(viewDeal(overdue, creator, tax, "2026-10-09").interest, 0);
});

// ------------------------------------------------------------------ Invoice numbering
test("Invoice numbering: PREFIX/YYYY-YY/NNN, zero-padded to three digits", () => {
  assert.equal(invoiceNumber("RTK", "2026-27", 14), "RTK/2026-27/014");
  assert.equal(invoiceNumber("RTK", "2026-27", 1234), "RTK/2026-27/1234");
});

test("Invoice numbering: financial year runs April to March", () => {
  assert.equal(fyOf("2027-03-31"), "2026-27");
  assert.equal(fyOf("2027-04-01"), "2027-28");
  const profile = { state_code: "36", gstin: null } as Profile;
  const inv = buildInvoice({ profile, tax, brandStateCode: "36", fee: R(1000), gstMode: "none", tdsRate: 0, advanceReceived: 0, termsDays: 30, invoiceDate: "2027-04-01", deliverables: [], usage: null });
  assert.equal(inv.fy, "2027-28");
});

test("Invoice numbering: sequence restarts at 001 each year, otherwise continues", () => {
  assert.equal(nextInvoiceSeq(null), 1);
  assert.equal(nextInvoiceSeq(undefined), 1);
  assert.equal(nextInvoiceSeq(14), 15);
});

test("Invoice numbering: default prefix from the creator's initials", () => {
  assert.equal(defaultPrefix("Ravi Teja K"), "RTK");
  assert.equal(defaultPrefix("Asha"), "ASH");
  assert.equal(defaultPrefix("Priya Nair Sharma Rao Iyer"), "PNSR");
  assert.equal(defaultPrefix("  "), "INV");
});
