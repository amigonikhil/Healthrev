import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAis } from "./ais.ts";
import { aisMatches, normName } from "./tax.ts";

test("parses nested AIS-like JSON and merges per deductor", () => {
  const json = { data: { tds: [
    { "Information Source": "ZENVOLT CHARGERS PRIVATE LIMITED (CHEZ08765P)", "Amount Paid/Credited": "25,000.00", "TDS Deducted": "2,500.00" },
    { DeductorName: "SPARK AGENCY LLP", DeductorTAN: "MUMS05678K", TDSAmount: 1400 },
    { DeductorName: "SPARK AGENCY LLP", DeductorTAN: "MUMS05678K", TDSAmount: 1400 },
    { note: "no amount", DeductorName: "X" },
  ] } };
  const lines = parseAis(json);
  assert.equal(lines.length, 2);
  const z = lines.find((l) => l.tan === "CHEZ08765P")!;
  assert.equal(z.deductor_name, "ZENVOLT CHARGERS PRIVATE LIMITED");
  assert.equal(z.amount_paise, 250_000);
  assert.equal(lines.find((l) => l.tan === "MUMS05678K")!.amount_paise, 280_000);
});

test("matches deductors to brands by TAN or name", () => {
  assert.equal(normName("Voltra Motors Pvt. Ltd."), "voltra motors");
  const brand = { name: "Voltra Motors", legal_name: "Voltra Motors Pvt Ltd", tan: null, agency_name: null };
  assert.ok(aisMatches({ deductor_name: "VOLTRA MOTORS PRIVATE LIMITED", tan: null }, brand, false));
  assert.ok(!aisMatches({ deductor_name: "ZENVOLT CHARGERS", tan: null }, brand, false));
  const glow = { name: "Glow Labs", legal_name: null, tan: "MUMS05678K", agency_name: "Spark Agency" };
  assert.ok(aisMatches({ deductor_name: "SPARK AGENCY LLP", tan: null }, glow, true));
  assert.ok(aisMatches({ deductor_name: "whatever", tan: "MUMS05678K" }, glow, true));
});
