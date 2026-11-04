import { tdsEstimate } from "./calc";
import { addDays, fmtMonth, fyOf, fyRange } from "./dates";
import type { DealView } from "./deal-view";
import type { AisEntry, Brand, Filing, Profile } from "./types";

// VERIFY WITH CA: everything in the Tax hub is an estimate to discuss with a CA.

const STOP = /\b(private|pvt|limited|ltd|llp|india|the|and|co|company|inc|opc)\b/g;
export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(STOP, " ").replace(/\s+/g, " ").trim();

/** Does an AIS deductor line belong to this payer (brand, or the agency paying for it)? */
export function aisMatches(e: Pick<AisEntry, "deductor_name" | "tan">, b: Pick<Brand, "name" | "legal_name" | "tan" | "agency_name">, viaAgency: boolean): boolean {
  if (e.tan && b.tan && e.tan.toUpperCase() === b.tan.toUpperCase()) return true;
  const d = normName(e.deductor_name);
  const names = viaAgency && b.agency_name ? [b.agency_name] : [b.name, b.legal_name ?? ""];
  return names.map(normName).filter((n) => n.length >= 3).some((n) => d.includes(n) || n.includes(d) || d.split(" ")[0] === n.split(" ")[0] && n.split(" ")[0].length >= 4);
}

export type PayerTds = { brand: Brand; viaAgency: boolean; expected: number; inAis: number; missing: number; invoiceNos: string[] };

export type TaxHub = {
  fy: string;
  income: number; brands: number; gst: number; tdsExpected: number; tdsInAis: number; missingTotal: number;
  payers: PayerTds[];
  invoiceCount: number;
};

export function taxHub(views: DealView[], ais: AisEntry[], today: string): TaxHub {
  const fy = fyOf(today);
  const invoiced = views.filter((v) => v.d.invoice && v.d.invoice.fy === fy);
  const byPayer = new Map<string, PayerTds>();
  let income = 0, gst = 0, tdsExpected = 0;
  for (const v of invoiced) {
    const inv = v.d.invoice!;
    income += inv.taxable_paise;
    gst += inv.cgst_paise + inv.sgst_paise + inv.igst_paise;
    // Settled invoices use the TDS actually deducted; open ones the estimate.
    const t = v.phase === "paid" ? v.tdsRecorded : Math.max(v.tdsRecorded, tdsEstimate(inv.taxable_paise, Number(inv.tds_rate)));
    tdsExpected += t;
    const viaAgency = v.d.paid_by === "agency" && !!v.d.brand.agency_name;
    const key = v.d.brand.id;
    const p = byPayer.get(key) ?? { brand: v.d.brand, viaAgency, expected: 0, inAis: 0, missing: 0, invoiceNos: [] };
    p.expected += t;
    p.invoiceNos.push(inv.number);
    byPayer.set(key, p);
  }
  const fyAis = ais.filter((e) => e.fy === fy);
  const used = new Set<string>();
  for (const p of byPayer.values()) {
    for (const e of fyAis) {
      if (used.has(e.id) || !aisMatches(e, p.brand, p.viaAgency)) continue;
      p.inAis += e.amount_paise;
      used.add(e.id);
    }
    p.missing = Math.max(0, p.expected - p.inAis);
  }
  const payers = [...byPayer.values()].sort((a, b) => b.missing - a.missing);
  return {
    fy, income, gst, tdsExpected,
    brands: new Set(invoiced.map((v) => v.d.brand.id)).size,
    tdsInAis: fyAis.reduce((a, e) => a + e.amount_paise, 0),
    missingTotal: payers.reduce((a, p) => a + p.missing, 0),
    payers,
    invoiceCount: invoiced.length,
  };
}

export type FilingCard = {
  type: Filing["type"]; period: string; title: string; detail: string; due: string; filing: Filing | null;
};

/** The next GSTR-1, GSTR-3B, advance-tax instalment and ITR. VERIFY WITH CA: due dates. */
export function upcomingFilings(views: DealView[], profile: Profile, filings: Filing[], today: string, hub: TaxHub): FilingCard[] {
  const find = (type: Filing["type"], period: string) => filings.find((f) => f.type === type && f.period === period) ?? null;
  const out: FilingCard[] = [];
  const month = today.slice(0, 7);
  const next = addDays(`${month}-01`, 32).slice(0, 7);
  if (profile.gstin) {
    const monthInv = views.filter((v) => v.d.invoice?.invoice_date.startsWith(month)).map((v) => v.d.invoice!);
    const taxable = monthInv.reduce((a, i) => a + i.taxable_paise, 0);
    const gst = monthInv.reduce((a, i) => a + i.cgst_paise + i.sgst_paise + i.igst_paise, 0);
    out.push({ type: "gstr1", period: month, title: `GSTR-1 · ${fmtMonth(today)}`, detail: `${monthInv.length} invoice${monthInv.length === 1 ? "" : "s"} · ${fmtInr(taxable)} taxable`, due: `${next}-11`, filing: find("gstr1", month) });
    out.push({ type: "gstr3b", period: month, title: `GSTR-3B · ${fmtMonth(today)}`, detail: `GST payable ${fmtInr(gst)}`, due: `${next}-20`, filing: find("gstr3b", month) });
  }
  const { start, end } = fyRange(hub.fy);
  const y = start.slice(0, 4), y1 = end.slice(0, 4);
  const instalments = [`${y}-06-15`, `${y}-09-15`, `${y}-12-15`, `${y1}-03-15`];
  const nextAdv = instalments.find((d) => d >= today);
  if (nextAdv) {
    const period = `${hub.fy}-${nextAdv.slice(5, 7)}`;
    out.push({ type: "advance_tax", period, title: "Advance tax", detail: `Based on ${fmtInr(hub.income)} invoiced so far`, due: nextAdv, filing: find("advance_tax", period) });
  }
  out.push({ type: "itr", period: hub.fy, title: "Income tax return", detail: `FY ${hub.fy} · ITR-4`, due: `${y1}-07-31`, filing: find("itr", hub.fy) });
  return out;
}

const fmtInr = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");
