import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgreement } from "./agreement.ts";
import type { Brand, Deal, Profile } from "./types.ts";

const profile = { name: "Priya", state: "Karnataka", state_code: "29", city: "Bengaluru", gstin: "29ABCPS1234Q1Z5", udyam_no: null } as unknown as Profile;
const brand = { name: "Nimbus", legal_name: "Nimbus Pvt Ltd", gstin: null, agency_name: null } as unknown as Brand;
const deal = (x: Partial<Deal>) => ({ fee_paise: 6_000_000, advance_paise: 0, terms_days: 50, paid_by: "brand", go_live_date: null, gst_mode: "add", tds_rate: 10, ...x }) as Deal;
const text = (d: Deal, rate = 36, p = profile, period: "week" | "year" = "year") =>
  buildAgreement({ profile: p, pan: "ABCPS1234Q", brand, deal: d, deliverables: [{ id: "1", deal_id: "d", platform: "Instagram", type: "Reel", quantity: 1 }], usage: { deal_id: "d", enabled: true, duration: "7m", scope: "organic" }, date: "2026-10-25", lateInterest: { rate, period } })
    .clauses.map((c) => c.join(" ")).join("\n");

test("late payment clause applies to non-MSME creators at the configured rate", () => {
  const t = text(deal({}));
  assert.match(t, /Late payment Any amount not paid by its due date carries interest at 36% a year/);
  assert.doesNotMatch(t, /MSMED/);
});

test("weekly late interest reads as per week, pro rata, with legal costs", () => {
  const t = text(deal({}), 10, profile, "week");
  assert.match(t, /interest at 10% per week on the unpaid amount \(pro rata for part of a week\), from the due date until it is paid, together with any legal costs of recovering it/);
});

test("MSME creators get both the contractual rate and their statutory rights", () => {
  const t = text(deal({}), 18, { ...profile, udyam_no: "UDYAM-KA-02-0012345" } as Profile);
  assert.match(t, /interest at 18% a year/);
  assert.match(t, /registered under the MSMED Act, 2006 \(UDYAM-KA-02-0012345\)/);
});

test("fee wording follows the GST choice; TDS line only when TDS applies; custom terms and months", () => {
  assert.match(text(deal({ gst_mode: "add" })), /₹60,000 plus GST/);
  assert.match(text(deal({ gst_mode: "incl" })), /₹60,000 inclusive of GST/);
  const none = text(deal({ gst_mode: "none", tds_rate: 0 }));
  assert.match(none, /₹60,000 for all deliverables/);
  assert.doesNotMatch(none, /TDS/);
  assert.match(none, /payable within 50 days/);
  assert.match(none, /use the content for 7 months, for organic reshares only/);
});
