// "Paste deal": what Claude reads out of a pasted brand message or screenshot, cleaned up
// for the New deal form. Pure, so the form (client) and the extractor (server) share it.
import { ALL_DELIVERABLES, deliverableKey, USAGE_MAX_MONTHS } from "./deliverables";

/** Fields the form can highlight as "check this". */
export const PASTE_FIELDS = [
  "brand_name", "contact_name", "contact_email", "contact_whatsapp", "deliverables",
  "fee", "advance", "usage_rights", "go_live_date", "payment_terms",
] as const;
export type PasteField = (typeof PASTE_FIELDS)[number];

export const USAGE_SCOPE_VALUES = ["organic_paid", "organic", "paid"] as const;

/** Raw shape Claude returns (structured output); numbers in rupees. */
export type RawExtraction = {
  brand_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_whatsapp: string | null;
  deliverables: { key: string; quantity: number }[];
  other_deliverables: string[];
  fee_rupees: number | null;
  fee_gst: "plus_gst" | "including_gst" | "not_mentioned";
  advance_rupees: number | null;
  usage_rights: { months: number | null; perpetual: boolean; scope: (typeof USAGE_SCOPE_VALUES)[number] | null } | null;
  go_live_date: string | null;
  payment_terms_days: number | null;
  unsure: string[];
};

/** What the New deal form is prefilled with. Amounts stay in rupees, as typed in the form. */
export type PastedDeal = {
  brand: string;
  contactName: string;
  contactEmail: string;
  contactWhatsapp: string;
  deliverables: { key: string; quantity: number }[];
  otherDeliverables: string[];
  fee: number | null;
  feeGst: RawExtraction["fee_gst"];
  advance: number | null;
  usage: { months: number; perpetual: boolean; scope: (typeof USAGE_SCOPE_VALUES)[number] } | null;
  goLive: string | null;
  termsDays: number | null;
  unsure: PasteField[];
  /** Fields nothing was found for, so the creator knows what to fill in. */
  missing: PasteField[];
};

/** sessionStorage hand-off from the paste sheet to the New deal form (read once, then removed). */
export const PASTED_DEAL_KEY = "ca:pasted-deal";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (s: string | null | undefined, max = 120) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const money = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null);

/** Validates Claude's answer against what the form accepts; anything doubtful is flagged rather than dropped silently. */
export function normalizeExtraction(raw: RawExtraction, today: string): PastedDeal {
  const unsure = new Set<PasteField>(raw.unsure.filter((f): f is PasteField => (PASTE_FIELDS as readonly string[]).includes(f)));

  let contactEmail = clean(raw.contact_email, 200);
  if (contactEmail && !EMAIL_RE.test(contactEmail)) { contactEmail = ""; unsure.add("contact_email"); }
  const contactWhatsapp = clean(raw.contact_whatsapp, 20).replace(/[^\d+ ]/g, "");

  const byKey = new Map(ALL_DELIVERABLES.map((d) => [deliverableKey(d), d]));
  const deliverables = new Map<string, number>();
  for (const d of raw.deliverables) {
    const def = byKey.get(d.key);
    if (!def) continue;
    const q = Math.round(d.quantity);
    const max = def.unit === "days" ? 365 : 99;
    if (!(q >= 1)) { unsure.add("deliverables"); continue; }
    if (q > max) unsure.add("deliverables");
    deliverables.set(d.key, Math.min(max, (deliverables.get(d.key) ?? 0) + q));
  }

  const fee = money(raw.fee_rupees);
  let advance = money(raw.advance_rupees);
  if (advance && fee && advance > fee) { advance = null; unsure.add("advance"); unsure.add("fee"); }

  let usage: PastedDeal["usage"] = null;
  if (raw.usage_rights) {
    const m = raw.usage_rights.months;
    const months = typeof m === "number" && m >= 1 ? Math.min(USAGE_MAX_MONTHS, Math.round(m)) : 3;
    if (!raw.usage_rights.perpetual && (typeof m !== "number" || m < 1 || m > USAGE_MAX_MONTHS)) unsure.add("usage_rights");
    usage = { months, perpetual: raw.usage_rights.perpetual, scope: raw.usage_rights.scope ?? "organic_paid" };
  }

  let goLive = raw.go_live_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.go_live_date) && !Number.isNaN(Date.parse(raw.go_live_date)) ? raw.go_live_date : null;
  if (raw.go_live_date && !goLive) unsure.add("go_live_date");
  if (goLive && goLive < today) { goLive = null; unsure.add("go_live_date"); } // the form only accepts today or later

  let termsDays = typeof raw.payment_terms_days === "number" ? Math.round(raw.payment_terms_days) : null;
  if (termsDays !== null && (termsDays < 1 || termsDays > 365)) { termsDays = null; unsure.add("payment_terms"); }

  const out: Omit<PastedDeal, "unsure" | "missing"> = {
    brand: clean(raw.brand_name), contactName: clean(raw.contact_name), contactEmail, contactWhatsapp,
    deliverables: [...deliverables].map(([key, quantity]) => ({ key, quantity })),
    otherDeliverables: raw.other_deliverables.map((s) => clean(s, 80)).filter(Boolean).slice(0, 10),
    fee, feeGst: raw.fee_gst, advance, usage, goLive, termsDays,
  };
  const filled: Record<PasteField, boolean> = {
    brand_name: !!out.brand, contact_name: !!out.contactName, contact_email: !!out.contactEmail, contact_whatsapp: !!out.contactWhatsapp,
    deliverables: out.deliverables.length > 0, fee: out.fee !== null, advance: out.advance !== null, usage_rights: out.usage !== null,
    go_live_date: out.goLive !== null, payment_terms: out.termsDays !== null,
  };
  return {
    ...out,
    unsure: PASTE_FIELDS.filter((f) => unsure.has(f)),
    missing: (["brand_name", "deliverables", "fee"] as const).filter((f) => !filled[f]),
  };
}

/** True when the paste had nothing deal-like in it. */
export const isEmptyExtraction = (d: PastedDeal) =>
  !d.brand && !d.contactName && !d.contactEmail && !d.contactWhatsapp && !d.deliverables.length && d.fee === null && d.advance === null && !d.usage && !d.goLive && d.termsDays === null;
