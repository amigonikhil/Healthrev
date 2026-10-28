import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmptyExtraction, normalizeExtraction, type RawExtraction } from "./pasted-deal.ts";

const TODAY = "2026-10-28";
const base: RawExtraction = {
  brand_name: null, contact_name: null, contact_email: null, contact_whatsapp: null, deliverables: [], other_deliverables: [],
  fee_rupees: null, fee_gst: "not_mentioned", advance_rupees: null, usage_rights: null, go_live_date: null, payment_terms_days: null, unsure: [],
};

test("a full extraction maps onto the form", () => {
  const d = normalizeExtraction({
    ...base, brand_name: "  Glow Labs ", contact_name: "Priya", contact_email: "priya@glowlabs.in", contact_whatsapp: "+91 98765-43210",
    deliverables: [{ key: "Instagram|Reel", quantity: 1 }, { key: "Instagram|Story", quantity: 3 }],
    fee_rupees: 45000, fee_gst: "plus_gst", advance_rupees: 22500, usage_rights: { months: 3, perpetual: false, scope: "organic_paid" },
    go_live_date: "2026-11-15", payment_terms_days: 30, unsure: ["advance"],
  }, TODAY);
  assert.equal(d.brand, "Glow Labs");
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
  assert.deepEqual(d.missing, ["brand_name", "deliverables", "fee"]);
  assert.deepEqual(d.unsure, []);
  assert.ok(isEmptyExtraction(d));
  assert.ok(!isEmptyExtraction(normalizeExtraction({ ...base, fee_rupees: 5000 }, TODAY)));
});
