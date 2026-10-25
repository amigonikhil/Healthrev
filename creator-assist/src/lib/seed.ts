import "server-only";
import { randomUUID } from "node:crypto";
import { buildAgreement } from "./agreement";
import { lateTerms, type TaxConfig } from "./calc";
import { randomToken } from "./crypto";
import { addDays, fyOf, nineAmIST } from "./dates";
import { buildInvoice, invoiceNumber } from "./invoice";
import { stageAt } from "./messages";
import { rupees } from "./money";
import type { DB } from "./supabase/server";
import type { Brand, Deal, DealDeliverable, Profile, UsageRights } from "./types";

// The prototype's demo set. Every date is relative to `today`, so the demo
// always looks current: Voltra 18 days overdue, Glow due today, FitFuel due in 4.

type SampleDeal = {
  key: string;
  brand: Omit<Brand, "id" | "user_id" | "is_sample" | "created_at">;
  paidBy: "brand" | "agency";
  fee: number; advance: number; advanceAt: number | null;
  goLive: number; terms: 30 | 45 | 60; createdAt: number;
  status: Deal["status"];
  deliverables: [string, string, number][];
  usage: [string, string] | null;
  agreement: { sentAt: number; signedAt?: number; signer?: [string, string, string] } | null;
  invoice: { seq: number; at: number } | null;
  payment?: { amount: number; tds: number; at: number; utr: string };
};

const b = (x: Partial<SampleDeal["brand"]>): SampleDeal["brand"] => ({
  name: "", legal_name: null, gstin: null, tan: null, city: null, state: null, state_code: null,
  contact_name: null, contact_email: null, contact_whatsapp: null, cc_email: null, agency_name: null, ...x,
});

export const SAMPLE: SampleDeal[] = [
  {
    key: "voltra",
    brand: b({ name: "Voltra Motors", legal_name: "Voltra Motors Pvt Ltd", gstin: "29AAACV1234M1Z2", tan: "BLRV01234E", city: "Bengaluru", state: "Karnataka", state_code: "29", contact_name: "Arjun Mehta", contact_email: "arjun@voltra.in", contact_whatsapp: "+919000012345" }),
    paidBy: "brand", fee: 45000, advance: 15000, advanceAt: -66, goLive: -63, terms: 45, createdAt: -70, status: "overdue",
    deliverables: [["Instagram", "Reel", 2], ["Instagram", "Story", 3]], usage: ["3m", "organic_paid"],
    agreement: { sentAt: -67, signedAt: -66, signer: ["Arjun Mehta", "Marketing Manager", "arjun@voltra.in"] },
    invoice: { seq: 14, at: -63 },
  },
  {
    key: "glow",
    brand: b({ name: "Glow Labs", legal_name: "Glow Labs Pvt Ltd", gstin: "27AAGCG5678K1Z9", tan: "MUMS05678K", city: "Mumbai", state: "Maharashtra", state_code: "27", contact_name: "Neha Shah", contact_email: "neha@sparkagency.in", contact_whatsapp: "+919000023456", cc_email: "finance@sparkagency.in", agency_name: "Spark Agency" }),
    paidBy: "agency", fee: 28000, advance: 0, advanceAt: null, goLive: -30, terms: 30, createdAt: -40, status: "invoiced",
    deliverables: [["Instagram", "Reel", 1], ["Instagram", "Story", 3]], usage: null,
    agreement: { sentAt: -38, signedAt: -37, signer: ["Neha Shah", "Account Manager, Spark Agency", "neha@sparkagency.in"] },
    invoice: { seq: 13, at: -30 },
  },
  {
    key: "fitfuel",
    brand: b({ name: "FitFuel Foods", legal_name: "FitFuel Foods Pvt Ltd", gstin: "36AAFCF4321L1Z3", tan: "HYDF04321L", city: "Hyderabad", state: "Telangana", state_code: "36", contact_name: "Kiran Rao", contact_email: "kiran@fitfuel.in", contact_whatsapp: "+919000067890" }),
    paidBy: "brand", fee: 12000, advance: 0, advanceAt: null, goLive: -26, terms: 30, createdAt: -35, status: "invoiced",
    deliverables: [["Instagram", "Reel", 1], ["Instagram", "Story", 2]], usage: null,
    agreement: { sentAt: -33, signedAt: -32, signer: ["Kiran Rao", "Brand Manager", "kiran@fitfuel.in"] },
    invoice: { seq: 15, at: -26 },
  },
  {
    key: "urban",
    brand: b({ name: "Urban Roots Cafe", legal_name: "Urban Roots Hospitality LLP", city: "Hyderabad", state: "Telangana", state_code: "36", contact_name: "Sameer", contact_email: "sameer@urbanroots.cafe", contact_whatsapp: "+919000034567" }),
    paidBy: "brand", fee: 15000, advance: 0, advanceAt: null, goLive: 7, terms: 45, createdAt: -4, status: "agreement_sent",
    deliverables: [["Instagram", "Reel", 1]], usage: null,
    agreement: { sentAt: -3 }, invoice: null,
  },
  {
    key: "zenvolt",
    brand: b({ name: "Zenvolt Chargers", legal_name: "Zenvolt Chargers Pvt Ltd", gstin: "33AAECZ8765P1Z1", tan: "CHEZ08765P", city: "Chennai", state: "Tamil Nadu", state_code: "33", contact_name: "Priya Nair", contact_email: "priya@zenvolt.in", contact_whatsapp: "+919000045678" }),
    paidBy: "brand", fee: 25000, advance: 0, advanceAt: null, goLive: -33, terms: 30, createdAt: -45, status: "paid",
    deliverables: [["Instagram", "Reel", 1]], usage: ["1m", "organic"],
    agreement: { sentAt: -43, signedAt: -42, signer: ["Priya Nair", "Head of Marketing", "priya@zenvolt.in"] },
    invoice: { seq: 11, at: -33 },
    payment: { amount: 27000, tds: 2500, at: -13, utr: "HDFCN26285512094" },
  },
];

// AIS only shows Zenvolt and Glow Labs (deducted by Spark Agency), so Voltra
// and FitFuel surface as TDS mismatches in the Tax hub.
const AIS: { key: string; deductor: string; tds: number }[] = [
  { key: "zenvolt", deductor: "ZENVOLT CHARGERS PRIVATE LIMITED", tds: 2500 },
  { key: "glow", deductor: "SPARK AGENCY LLP", tds: 2800 },
];

const ts = (today: string, day: number, hhmm = "09:00") => {
  const t = nineAmIST(addDays(today, day));
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(new Date(t).getTime() + ((h - 9) * 60 + m) * 60_000).toISOString();
};

export function buildSamplePayload(args: { userId: string; profile: Profile; pan: string | null; tax: TaxConfig; today: string; maxSeqByFy: Record<string, number> }) {
  const { userId: user_id, profile, tax, today } = args;
  const day = (n: number) => addDays(today, n);
  const p: Record<string, unknown[]> = { brands: [], deals: [], deliverables: [], usage: [], agreements: [], invoices: [], payments: [], reminders: [], ais: [], filings: [] };
  const brandIds: Record<string, string> = {};
  const fyNumbers: Record<string, string> = {};

  for (const s of SAMPLE) {
    const brand: Brand = { id: randomUUID(), user_id, is_sample: true, created_at: ts(today, s.createdAt), ...s.brand };
    brandIds[s.key] = brand.id;
    p.brands.push(brand);

    const deal: Deal = {
      id: randomUUID(), user_id, brand_id: brand.id, paid_by: s.paidBy, fee_paise: rupees(s.fee), advance_paise: rupees(s.advance),
      advance_received_at: s.advanceAt != null ? day(s.advanceAt) : null, go_live_date: day(s.goLive), terms_days: s.terms,
      status: s.status, is_sample: true, created_at: ts(today, s.createdAt), updated_at: ts(today, s.createdAt),
      gst_mode: "add", tds_rate: tax.tds_rate,
    };
    p.deals.push(deal);

    const deliverables: DealDeliverable[] = s.deliverables.map(([platform, type, quantity]) => ({ id: randomUUID(), user_id, deal_id: deal.id, platform, type, quantity }) as DealDeliverable);
    p.deliverables.push(...deliverables);
    const usage: UsageRights = { deal_id: deal.id, enabled: !!s.usage, duration: s.usage?.[0] ?? null, scope: s.usage?.[1] ?? null };
    p.usage.push({ ...usage, user_id });

    if (s.agreement) {
      const sentDate = day(s.agreement.sentAt);
      const body = buildAgreement({ profile, pan: args.pan, brand, deal, deliverables, usage, date: sentDate, lateInterest: lateTerms(tax) });
      const signed = s.agreement.signedAt != null;
      p.agreements.push({
        id: randomUUID(), user_id, deal_id: deal.id, body, sign_token: randomToken(), status: signed ? "signed" : "sent",
        sent_at: ts(today, s.agreement.sentAt, "11:30"), viewed_at: signed ? ts(today, s.agreement.signedAt!, "16:05") : null,
        signer_name: s.agreement.signer?.[0] ?? null, signer_designation: s.agreement.signer?.[1] ?? null, signer_email: s.agreement.signer?.[2] ?? null,
        signed_at: signed ? ts(today, s.agreement.signedAt!, "16:12") : null, signer_ip: signed ? "sample" : null, whatsapp_opt_in: signed ? true : null,
        otp_hash: null, otp_expires_at: null, otp_attempts: 0, is_sample: true, created_at: ts(today, s.agreement.sentAt, "11:30"),
      });
    }

    if (s.invoice) {
      const draft = buildInvoice({
        profile, tax, brandStateCode: brand.state_code, fee: deal.fee_paise, gstMode: deal.gst_mode, tdsRate: deal.tds_rate,
        advanceReceived: deal.advance_received_at ? deal.advance_paise : 0, termsDays: s.terms,
        invoiceDate: day(s.invoice.at), deliverables, usage,
      });
      const offset = Math.max(0, (args.maxSeqByFy[draft.fy] ?? 0) - 10);
      const seq = s.invoice.seq + offset;
      const invoice = {
        id: randomUUID(), user_id, deal_id: deal.id, number: invoiceNumber(profile.invoice_prefix, draft.fy, seq), seq, ...draft,
        pdf_path: null, is_sample: true, created_at: ts(today, s.invoice.at, "18:00"),
      };
      fyNumbers[s.key] = invoice.number;
      p.invoices.push(invoice);

      if (s.payment) {
        p.payments.push({
          id: randomUUID(), user_id, invoice_id: invoice.id, amount_paise: rupees(s.payment.amount), tds_paise: rupees(s.payment.tds),
          received_on: day(s.payment.at), utr: s.payment.utr, is_sample: true, created_at: ts(today, s.payment.at, "12:00"),
        });
      }

      // Payment reminder ladder from the user's own settings.
      const ladder = profile.reminder_ladder?.length ? profile.reminder_ladder : [0];
      ladder.forEach((offsetDays, i) => {
        const when = addDays(draft.due_date, offsetDays);
        const isPaid = s.status === "paid";
        const sent = !isPaid && when <= today;
        p.reminders.push({
          id: randomUUID(), user_id, deal_id: deal.id, brand_id: null, kind: "payment", stage: stageAt(i, ladder.length),
          channel: "email", language: profile.language, message: null, scheduled_at: nineAmIST(when),
          sent_at: sent ? nineAmIST(when) : null,
          read_at: sent && when < today ? new Date(Date.parse(nineAmIST(when)) + 280 * 60_000).toISOString() : null,
          cancelled_at: isPaid ? ts(today, s.payment!.at, "12:00") : null, is_sample: true, created_at: ts(today, s.invoice!.at, "18:00"),
        });
      });
    }
  }

  for (const a of AIS) {
    const inv = p.invoices.find((i) => (i as { number: string }).number === fyNumbers[a.key]) as { fy: string } | undefined;
    const brand = p.brands.find((x) => (x as Brand).id === brandIds[a.key]) as Brand;
    p.ais.push({
      id: randomUUID(), user_id, fy: inv?.fy ?? fyOf(today), deductor_name: a.deductor, tan: brand.tan, amount_paise: rupees(a.tds),
      source: "sample", file_path: null, is_sample: true, created_at: new Date().toISOString(),
    });
  }

  if (profile.gstin) {
    const period = today.slice(0, 7);
    const next = addDays(`${period}-01`, 32).slice(0, 7);
    for (const [type, dueDay] of [["gstr1", "11"], ["gstr3b", "20"]] as const) {
      p.filings.push({
        id: randomUUID(), user_id, type, period, due_date: `${next}-${dueDay}`, handled_by: profile.files_with, status: "ready",
        data_sent_at: new Date().toISOString(), is_sample: true, created_at: new Date().toISOString(),
      });
    }
  }
  return p;
}

/**
 * Loads the demo set into the user's account. Idempotent: the database
 * function takes a lock on profiles.sample_seeded_at, so a second call (or a
 * double tap) is a no-op. Returns true if data was inserted.
 */
export async function seedDemoData(db: DB, args: { userId: string; profile: Profile; pan: string | null; tax: TaxConfig; today: string }): Promise<boolean> {
  const { data: existing } = await db.from("invoices").select("fy, seq").eq("is_sample", false);
  const maxSeqByFy: Record<string, number> = {};
  for (const r of existing ?? []) maxSeqByFy[r.fy] = Math.max(maxSeqByFy[r.fy] ?? 0, r.seq);
  const payload = buildSamplePayload({ ...args, maxSeqByFy });
  const { data, error } = await db.rpc("seed_sample", { payload });
  if (error) throw new Error("Could not load sample data: " + error.message);
  return data === true;
}
