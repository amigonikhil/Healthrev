import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { TaxConfig } from "./calc";
import { todayIST } from "./dates";
import { viewDeal, type DealView } from "./deal-view";
import { createClient, type DB } from "./supabase/server";
import type { Brand, DealFull, Profile } from "./types";

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export const DEAL_SELECT =
  "*, brand:brands(*), deliverables:deal_deliverables(*), usage:usage_rights(*), invoice:invoices(*, payments(*)), agreements(*), reminders(*), escalations(*)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeDeal(row: any): DealFull {
  const agreements = (row.agreements ?? []) as DealFull["agreement"][];
  const agreement = agreements
    .filter((a) => a && a.status !== "void")
    .sort((a, b) => (a!.created_at < b!.created_at ? 1 : -1))[0] ?? null;
  const invoice = one(row.invoice);
  return {
    ...row,
    brand: one(row.brand),
    usage: one(row.usage),
    invoice: invoice ? { ...invoice, payments: invoice.payments ?? [] } : null,
    agreement,
    deliverables: row.deliverables ?? [],
    reminders: row.reminders ?? [],
    escalations: row.escalations ?? [],
  };
}

/** Signed-in user + their profile, or a redirect to sign-in / onboarding. */
export const getSession = cache(async () => {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/signin");
  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  return { db, user, profile };
});

export async function requireProfile() {
  const s = await getSession();
  if (!s.profile) redirect("/onboarding");
  return s as typeof s & { profile: Profile };
}

export async function getTax(db: DB): Promise<TaxConfig> {
  const { data } = await db.from("tax_config").select("*").maybeSingle();
  // Rows are created with the profile; this fallback only covers a missing row
  // and reads the same DB defaults by inserting it.
  if (!data) {
    const { data: created } = await db.from("tax_config").upsert({}, { onConflict: "user_id" }).select("*").single();
    return toTax(created);
  }
  return toTax(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toTax = (r: any): TaxConfig => ({
  gst_rate: Number(r?.gst_rate ?? 0),
  tds_rate: Number(r?.tds_rate ?? 0),
  late_interest_rate: Number(r?.late_interest_rate ?? 0),
  rbi_bank_rate: Number(r?.rbi_bank_rate ?? 0),
  msme_multiple: Number(r?.msme_multiple ?? 0),
});

export async function loadDeals(db: DB): Promise<DealFull[]> {
  const { data, error } = await db.from("deals").select(DEAL_SELECT).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeDeal);
}

export async function loadDeal(db: DB, id: string): Promise<DealFull | null> {
  const { data, error } = await db.from("deals").select(DEAL_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeDeal(data) : null;
}

export async function loadViews(): Promise<{ profile: Profile; tax: TaxConfig; today: string; views: DealView[]; db: DB }> {
  const { db, profile } = await requireProfile();
  const [tax, deals] = await Promise.all([getTax(db), loadDeals(db)]);
  const today = todayIST();
  return { db, profile, tax, today, views: deals.map((d) => viewDeal(d, profile, tax, today)) };
}

export async function loadDealView(id: string) {
  const { db, profile, user } = await requireProfile();
  const [tax, deal] = await Promise.all([getTax(db), loadDeal(db, id)]);
  if (!deal) redirect("/deals");
  const today = todayIST();
  return { db, user, profile, tax, today, v: viewDeal(deal, profile, tax, today) };
}

export async function loadBrands(db: DB): Promise<Brand[]> {
  const { data } = await db.from("brands").select("*").order("created_at", { ascending: false });
  return (data ?? []) as Brand[];
}
