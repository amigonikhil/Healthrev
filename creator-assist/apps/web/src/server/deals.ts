import "server-only";
import type { CreateDealInput, HomeSummary } from "@creator-assist/shared/api";
import type { TaxConfig } from "@creator-assist/shared/calc";
import { todayIST } from "@creator-assist/shared/dates";
import { viewDeal, type DealView } from "@creator-assist/shared/deal-view";
import { findDeliverable, USAGE_MAX_MONTHS, USAGE_SCOPES, usageMonths } from "@creator-assist/shared/deliverables";
import { brandRows, homeNumbers, type BrandRow } from "@creator-assist/shared/overview";
import { stateByName } from "@creator-assist/shared/states";
import type { Brand } from "@creator-assist/shared/types";
import { EMAIL_RE, GSTIN_RE } from "@creator-assist/shared/validate";
import { audit } from "@/lib/audit";
import { getTax, loadBrands, loadDeal, loadDeals } from "@/lib/data";
import { fail, track, type ProfileCtx } from "./context";

/** Every deal as a view (balance, phase, amounts), newest first. */
export async function listDeals(ctx: ProfileCtx): Promise<{ today: string; tax: TaxConfig; views: DealView[] }> {
  const [tax, deals] = await Promise.all([getTax(ctx.db), loadDeals(ctx.db)]);
  const today = todayIST();
  return { today, tax, views: deals.map((d) => viewDeal(d, ctx.profile, tax, today)) };
}

export async function getDeal(ctx: ProfileCtx, id: string): Promise<{ today: string; tax: TaxConfig; v: DealView }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) fail(404, "Deal not found", "not_found");
  const [tax, deal] = await Promise.all([getTax(ctx.db), loadDeal(ctx.db, id)]);
  if (!deal) fail(404, "Deal not found", "not_found");
  const today = todayIST();
  return { today, tax, v: viewDeal(deal, ctx.profile, tax, today) };
}

export async function home(ctx: ProfileCtx): Promise<HomeSummary> {
  const { today, views } = await listDeals(ctx);
  return { today, empty: views.length === 0, ...homeNumbers(views, today) };
}

export async function brands(ctx: ProfileCtx): Promise<{ today: string; rows: BrandRow[] }> {
  const { today, views } = await listDeals(ctx);
  return { today, rows: brandRows(views, today) };
}

/** What the New deal form needs: rates, the creator's GST/terms defaults and saved brands. */
export async function newDealOptions(ctx: ProfileCtx): Promise<{ today: string; tax: TaxConfig; brands: Brand[]; creator: { stateCode: string; registered: boolean; terms: number; msme: boolean } }> {
  const [tax, saved] = await Promise.all([getTax(ctx.db), loadBrands(ctx.db)]);
  const p = ctx.profile;
  return { today: todayIST(), tax, brands: saved, creator: { stateCode: p.state_code, registered: !!p.gstin, terms: p.default_terms_days, msme: !!p.udyam_no } };
}

const clean = (s: string | null | undefined) => (s ?? "").trim();

export async function createDeal(ctx: ProfileCtx, input: CreateDealInput): Promise<{ id: string }> {
  const { db, profile } = ctx;
  const brandName = clean(input.brand);
  const paidBy = input.paidBy === "agency" ? "agency" : "brand";
  const agency = clean(input.agency);
  const contactName = clean(input.contactName);
  const contactEmail = clean(input.contactEmail);
  const contactWa = clean(input.contactWhatsapp);
  const brandState = stateByName(clean(input.brandState));
  const brandGstin = clean(input.brandGstin).toUpperCase();
  const fee = input.feePaise;
  const advance = input.advance ? input.advance.paise : 0;
  const advReceived = !!input.advance?.received;
  const goLive = clean(input.goLive) || null;
  const terms = input.termsDays;
  // GST only for GST-registered creators. VERIFY WITH CA.
  const gstMode = !profile.gstin ? "none" : (["add", "incl", "none"].includes(input.gstMode ?? "") ? input.gstMode! : "add");
  const tdsRate = input.tds ? input.tds.rate : 0;
  const usage = input.usage;

  if (!brandName) fail(400, "Enter the brand name");
  if (paidBy === "agency" && !agency) fail(400, "Enter the agency name");
  if (!brandState) fail(400, "Choose the brand's state (decides IGST vs CGST + SGST)");
  if (contactEmail && !EMAIL_RE.test(contactEmail)) fail(400, "Contact email doesn't look right");
  if (brandGstin && !GSTIN_RE.test(brandGstin)) fail(400, "Brand GSTIN doesn't look right");
  if (!Number.isFinite(fee) || fee <= 0) fail(400, "Enter the total fee");
  if (input.advance && (!Number.isFinite(advance) || advance <= 0)) fail(400, "Enter the advance amount");
  if (advance > fee) fail(400, "Advance can't be more than the fee");
  if (!Number.isInteger(terms) || terms < 1 || terms > 365) fail(400, "Payment terms should be 1–365 days");
  if (input.tds && (!Number.isFinite(tdsRate) || tdsRate <= 0 || tdsRate > 100)) fail(400, "Enter the TDS rate (e.g. 10), or untick TDS");
  if (usage && usage.duration !== "perpetual" && !(usageMonths(usage.duration)! >= 1 && usageMonths(usage.duration)! <= USAGE_MAX_MONTHS)) {
    fail(400, `Usage rights should be 1–${USAGE_MAX_MONTHS} months or perpetual`);
  }
  if (goLive && !/^\d{4}-\d{2}-\d{2}$/.test(goLive)) fail(400, "Go-live date doesn't look right");

  // Only items from the deliverables menu, with sensible quantities.
  const deliverables = (input.deliverables ?? []).flatMap((d) => {
    const def = findDeliverable(d.platform, d.type);
    if (!def) return [];
    const q = Math.max(1, Math.min(def.unit === "days" ? 365 : 99, Math.round(Number(d.quantity)) || def.defaultQty));
    return [{ platform: def.platform, type: def.type, quantity: q }];
  });
  if (!deliverables.length) fail(400, "Pick at least one deliverable");
  const scope = usage ? (USAGE_SCOPES.some((s) => s.value === usage.scope) ? usage.scope! : "organic_paid") : null;

  // Reuse the creator's own brand record by name; sample brands are never reused.
  const { data: existing } = await db.from("brands").select("id").eq("is_sample", false).ilike("name", brandName).limit(1).maybeSingle();
  const brandRow = {
    name: brandName, state: brandState.name, state_code: brandState.code, gstin: brandGstin || null,
    contact_name: contactName || null, contact_email: contactEmail || null, contact_whatsapp: contactWa || null,
    agency_name: paidBy === "agency" ? agency : null, legal_name: clean(input.brandLegal) || null,
  };
  let brandId: string;
  if (existing) {
    brandId = existing.id;
    await db.from("brands").update(brandRow).eq("id", brandId);
  } else {
    const { data: b, error } = await db.from("brands").insert(brandRow).select("id").single();
    if (error || !b) fail(500, "Could not save the brand: " + error?.message);
    brandId = b.id;
  }

  const { data: deal, error } = await db.from("deals").insert({
    brand_id: brandId, paid_by: paidBy, fee_paise: fee, advance_paise: advance,
    advance_received_at: advReceived ? todayIST() : null, go_live_date: goLive, terms_days: terms, status: "draft",
    gst_mode: gstMode, tds_rate: tdsRate,
  }).select("id").single();
  if (error || !deal) fail(500, "Could not save the deal: " + error?.message);

  const [r1, r2] = await Promise.all([
    db.from("deal_deliverables").insert(deliverables.map((d) => ({ ...d, deal_id: deal.id }))),
    db.from("usage_rights").insert({ deal_id: deal.id, enabled: !!usage, duration: usage ? usage.duration : null, scope }),
  ]);
  if (r1.error || r2.error) {
    await db.from("deals").delete().eq("id", deal.id);
    fail(500, "Could not save deliverables: " + (r1.error ?? r2.error)?.message);
  }
  if (advReceived) await audit(db, ctx.user.id, "advance_recorded", "deal", deal.id, { amount_paise: advance });
  await track(ctx, "deal_created", { props: { deal_id: deal.id } });
  return { id: deal.id };
}

export async function markAdvanceReceived(ctx: ProfileCtx, dealId: string): Promise<void> {
  const { data } = await ctx.db.from("deals").update({ advance_received_at: todayIST() })
    .eq("id", dealId).is("advance_received_at", null).select("advance_paise").maybeSingle();
  if (data) await audit(ctx.db, ctx.user.id, "advance_recorded", "deal", dealId, { amount_paise: data.advance_paise });
}
