import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyExtraction, normalizeExtraction, type RawExtraction } from "./pasted-deal.ts";

const TODAY = "2026-10-28";
const base: RawExtraction = {
  brand_name: null, paid_by: null, agency_name: null, billing_state: null, gstin: null, contact_name: null, contact_email: null, contact_whatsapp: null, deliverables: [], other_deliverables: [],
  fee_rupees: null, fee_gst: "not_mentioned", advance_rupees: null, usage_rights: null, go_live_date: null, payment_terms_days: null, unsure: [],
};

test("a full extraction maps onto the form", () => {
  const d = normalizeExtraction({
    ...base, brand_name: "  Glow Labs ", paid_by: "brand", billing_state: "Karnataka", contact_name: "Priya", contact_email: "priya@glowlabs.in", contact_whatsapp: "+91 98765-43210",
    deliverables: [{ key: "Instagram|Reel", quantity: 1 }, { key: "Instagram|Story", quantity: 3 }],
    fee_rupees: 45000, fee_gst: "plus_gst", advance_rupees: 22500, usage_rights: { months: 3, perpetual: false, scope: "organic_paid" },
    go_live_date: "2026-11-15", payment_terms_days: 30, unsure: ["advance"],
  }, TODAY);
  assert.equal(d.brand, "Glow Labs");
  assert.equal(d.paidBy, "brand");
  assert.equal(d.state, "Karnataka");
  assert.equal(d.contactWhatsapp, "+91 9876543210");
  assert.deepEqual(d.deliverables, [{ key: "Instagram|Reel", quantity: 1 }, { key: "Instagram|Story", quantity: 3 }]);
  assert.equal(d.fee, 45000);
  assert.equal(d.advance, 22500);
  assert.deepEqual(d.usage, { months: 3, perpetual: false, scope: "organic_paid" });
  assert.equal(d.goLive, "2026-11-15");
  assert.equal(d.termsDays, 30);
  assert.deepEqual(d.unsure, ["advance"]);
  assert.deepEqual(d.missing, []);
});

test("doubtful values are flagged, not silently trusted", () => {
  const d = normalizeExtraction({
    ...base, brand_name: "X", contact_email: "not an email", fee_rupees: 10000, advance_rupees: 20000,
    go_live_date: "2026-10-01", payment_terms_days: 400, deliverables: [{ key: "Made|Up", quantity: 2 }, { key: "Add-on|Link in bio", quantity: 500 }],
    usage_rights: { months: 99, perpetual: false, scope: null },
  }, TODAY);
  assert.equal(d.contactEmail, "");
  assert.equal(d.advance, null, "advance larger than the fee is dropped");
  assert.equal(d.goLive, null, "past go-live dates aren't accepted by the form");
  assert.equal(d.termsDays, null);
  assert.deepEqual(d.deliverables, [{ key: "Add-on|Link in bio", quantity: 365 }], "unknown keys skipped, days capped");
  assert.deepEqual(d.usage, { months: 60, perpetual: false, scope: "organic_paid" });
  for (const f of ["contact_email", "advance", "fee", "go_live_date", "payment_terms", "deliverables", "usage_rights"]) assert.ok(d.unsure.includes(f as never), f);
});

test("missing essentials are listed, and an empty paste is detected", () => {
  const d = normalizeExtraction({ ...base, unsure: ["not_a_field" as never] }, TODAY);
  assert.deepEqual(d.missing, ["brand_name", "billing_state", "deliverables", "fee"]);
  assert.deepEqual(d.unsure, []);
  assert.ok(isEmptyExtraction(d));
  assert.ok(!isEmptyExtraction(normalizeExtraction({ ...base, fee_rupees: 5000 }, TODAY)));
});

test("an agency that pays, and the state of whoever is invoiced", () => {
  // "We're Spark, a Mumbai-based influencer agency, reaching out for Glow Labs (Bengaluru)"
  const d = normalizeExtraction({ ...base, brand_name: "Glow Labs", paid_by: "agency", agency_name: " Spark Agency ", billing_state: "maharashtra" }, TODAY);
  assert.equal(d.paidBy, "agency");
  assert.equal(d.agency, "Spark Agency");
  assert.equal(d.state, "Maharashtra", "matched to the GST state list, any case");
  assert.ok(!d.missing.includes("billing_state"));

  const noName = normalizeExtraction({ ...base, paid_by: "agency" }, TODAY);
  assert.ok(noName.unsure.includes("paid_by"), "agency without a name is flagged");
  const nameOnly = normalizeExtraction({ ...base, agency_name: "Spark" }, TODAY);
  assert.equal(nameOnly.paidBy, "agency");
  assert.ok(nameOnly.unsure.includes("paid_by"));
});

test("state: unknown names are flagged; a GSTIN's state code wins over a guess", () => {
  const bad = normalizeExtraction({ ...base, billing_state: "Bombay" }, TODAY);
  assert.equal(bad.state, "");
  assert.ok(bad.unsure.includes("billing_state") && bad.missing.includes("billing_state"));

  const g = normalizeExtraction({ ...base, billing_state: "Karnataka", gstin: "27aaacv1234m1z2" }, TODAY);
  assert.equal(g.gstin, "27AAACV1234M1Z2");
  assert.equal(g.state, "Maharashtra", "27 = Maharashtra");
  assert.ok(g.unsure.includes("billing_state"), "the conflict is flagged");

  const junk = normalizeExtraction({ ...base, gstin: "12345" }, TODAY);
  assert.equal(junk.gstin, "");
});
