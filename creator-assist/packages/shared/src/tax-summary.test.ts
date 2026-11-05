import { test } from "node:test";
import assert from "node:assert/strict";
import { caSummaryText, type TaxHub } from "./tax.ts";
import type { Brand } from "./types.ts";

const brand = (name: string, agency: string | null = null) => ({ id: name, name, agency_name: agency } as unknown as Brand);

test("CA summary lists FY totals, TDS per payer and what's missing from AIS", () => {
  const hub: TaxHub = {
    fy: "2026-27", income: 11_000_000, brands: 2, gst: 1_980_000, tdsExpected: 1_100_000, tdsInAis: 530_000, missingTotal: 570_000, invoiceCount: 4,
    payers: [
      { brand: brand("Voltra Motors"), viaAgency: false, expected: 450_000, inAis: 0, missing: 450_000, invoiceNos: ["RTK/2026-27/014"] },
      { brand: brand("Glow Labs", "Spark Agency"), viaAgency: true, expected: 280_000, inAis: 280_000, missing: 0, invoiceNos: ["RTK/2026-27/013"] },
    ],
  };
  const t = caSummaryText(hub, { name: "Ravi Teja K", pan_masked: "ABCDE••••F", gstin: "36ABCDE1234F1Z5" }, { title: "ITR for FY 2026-27", due: "31 Jul" });
  assert.match(t, /^Creator Assist summary · FY 2026-27 · for ITR for FY 2026-27 \(due 31 Jul\)/);
  assert.match(t, /Ravi Teja K · PAN ABCDE••••F · GSTIN 36ABCDE1234F1Z5/);
  assert.match(t, /Income invoiced: ₹1,10,000 \(4 invoices, 2 brands\)/);
  assert.match(t, /TDS showing in AIS: ₹5,300 \(₹5,700 missing\)/);
  assert.match(t, /- Voltra Motors: ₹4,500 expected, ₹0 in AIS, ₹4,500 missing · invoices RTK\/2026-27\/014/);
  assert.match(t, /- Glow Labs \(via Spark Agency\): ₹2,800 expected, ₹2,800 in AIS · invoices/);
  assert.doesNotMatch(t, /ABCDE1234F\b/, "never the full PAN");
});
