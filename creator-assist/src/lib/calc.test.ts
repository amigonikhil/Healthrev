import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, dealSummary, gstSplit, msmeInterest, type TaxConfig } from "./calc.ts";
import { amountInWords, inr, parseRupees } from "./money.ts";
import { addDays, daysBetween, fyOf, todayIST } from "./dates.ts";

const tax: TaxConfig = { gst_rate: 18, tds_rate: 10, rbi_bank_rate: 5.5, msme_multiple: 3 };

test("Voltra: IGST deal with advance matches the prototype", () => {
  const s = dealSummary({ feePaise: 4_500_000, advancePaise: 1_500_000, creatorStateCode: "36", brandStateCode: "29", creatorRegistered: true, tax });
  assert.equal(s.gst.kind, "igst");
  assert.equal(s.gst.igst, 810_000);
  assert.equal(s.total, 5_310_000);
  assert.equal(s.tds, 450_000);
  assert.equal(s.balanceDue, 3_810_000);
  assert.equal(s.receive, 3_360_000);
});

test("same state splits CGST + SGST", () => {
  const g = gstSplit(1_200_000, "36", "36", 18, true);
  assert.equal(g.kind, "cgst_sgst");
  assert.equal(g.cgst, 108_000);
  assert.equal(g.sgst, 108_000);
  assert.equal(g.total, 216_000);
});

test("unregistered creator charges no GST", () => {
  assert.equal(gstSplit(1_000_000, "36", "29", 18, false).total, 0);
});

test("MSME interest: ₹38,100 for 18 days at 3 × 5.5% ≈ ₹310", () => {
  assert.equal(Math.round(msmeInterest(3_810_000, 18, tax) / 100), 310);
  assert.ok(msmeInterest(3_810_000, 65, tax) > msmeInterest(3_810_000, 60, tax));
  assert.equal(msmeInterest(3_810_000, 0, tax), 0);
});

test("allocate sums exactly and matches the prototype's reel/story split", () => {
  assert.deepEqual(allocate(4_500_000, [12, 3]), [3_600_000, 900_000]);
  const a = allocate(1_000_000, [1, 1, 1]);
  assert.equal(a.reduce((x, y) => x + y, 0), 1_000_000);
});

test("money formatting", () => {
  assert.equal(inr(10_030_000), "₹1,00,300");
  assert.equal(inr(3_810_000), "₹38,100");
  assert.equal(parseRupees("45,000"), 4_500_000);
  assert.ok(Number.isNaN(parseRupees("abc")));
  assert.equal(amountInWords(5_310_000), "Rupees fifty-three thousand one hundred only");
  assert.equal(amountInWords(10_030_000), "Rupees one lakh three hundred only");
});

test("dates", () => {
  assert.equal(fyOf("2026-04-01"), "2026-27");
  assert.equal(fyOf("2027-03-31"), "2026-27");
  assert.equal(addDays("2026-10-25", -18), "2026-10-07");
  assert.equal(daysBetween("2026-10-07", "2026-10-25"), 18);
  assert.equal(todayIST(new Date("2026-10-24T19:00:00Z")), "2026-10-25");
});
