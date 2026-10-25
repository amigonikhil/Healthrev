"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireProfile } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { ALL_DELIVERABLES, deliverableKey, USAGE_MAX_MONTHS, usageMonths } from "@/lib/deliverables";
import { parseRupees } from "@/lib/money";
import { stateByName } from "@/lib/states";
import { EMAIL_RE, GSTIN_RE, str, up } from "@/lib/validate";

export type DealFormState = { error?: string } | undefined;

export async function createDeal(_: DealFormState, f: FormData): Promise<DealFormState> {
  const { db, user, profile } = await requireProfile();

  const brandName = str(f.get("brand"));
  const paidBy = f.get("paid_by") === "agency" ? "agency" : "brand";
  const agency = str(f.get("agency"));
  const contactName = str(f.get("contact_name"));
  const contactEmail = str(f.get("contact_email"));
  const contactWa = str(f.get("contact_whatsapp"));
  const brandState = stateByName(str(f.get("brand_state")));
  const brandGstin = up(f.get("brand_gstin"));
  const fee = parseRupees(str(f.get("fee")));
  const advOn = f.get("advance_on") === "on";
  const advance = advOn ? parseRupees(str(f.get("advance"))) : 0;
  const advReceived = advOn && f.get("advance_received") === "on";
  const goLive = str(f.get("go_live")) || null;
  const terms = parseInt(str(f.get("terms")), 10);
  const usageOn = f.get("usage_on") === "on";
  // GST only for GST-registered creators. VERIFY WITH CA.
  const gstModeIn = str(f.get("gst_mode"));
  const gstMode = !profile.gstin ? "none" : (["add", "incl", "none"].includes(gstModeIn) ? gstModeIn : "add");
  const tdsOn = f.get("tds_on") === "on";
  const tdsRate = tdsOn ? parseFloat(str(f.get("tds_rate"))) : 0;
  const usageDuration = str(f.get("usage_duration")) || "3m";

  if (!brandName) return { error: "Enter the brand name" };
  if (paidBy === "agency" && !agency) return { error: "Enter the agency name" };
  if (!brandState) return { error: "Choose the brand's state (decides IGST vs CGST + SGST)" };
  if (contactEmail && !EMAIL_RE.test(contactEmail)) return { error: "Contact email doesn't look right" };
  if (brandGstin && !GSTIN_RE.test(brandGstin)) return { error: "Brand GSTIN doesn't look right" };
  if (!Number.isFinite(fee) || fee <= 0) return { error: "Enter the total fee" };
  if (advOn && (!Number.isFinite(advance) || advance <= 0)) return { error: "Enter the advance amount" };
  if (advance > fee) return { error: "Advance can't be more than the fee" };
  if (!Number.isInteger(terms) || terms < 1 || terms > 365) return { error: "Payment terms should be 1–365 days" };
  if (tdsOn && (!Number.isFinite(tdsRate) || tdsRate <= 0 || tdsRate > 100)) return { error: "Enter the TDS rate (e.g. 10), or untick TDS" };
  if (usageOn && usageDuration !== "perpetual" && !(usageMonths(usageDuration)! >= 1 && usageMonths(usageDuration)! <= USAGE_MAX_MONTHS)) {
    return { error: `Usage rights should be 1–${USAGE_MAX_MONTHS} months or perpetual` };
  }
  if (goLive && !/^\d{4}-\d{2}-\d{2}$/.test(goLive)) return { error: "Go-live date doesn't look right" };

  const deliverables = ALL_DELIVERABLES.flatMap((d) => {
    const k = deliverableKey(d);
    if (f.get(`dl:${k}`) !== "on") return [];
    const q = Math.max(1, Math.min(d.unit === "days" ? 365 : 99, parseInt(str(f.get(`q:${k}`)), 10) || d.defaultQty));
    return [{ platform: d.platform, type: d.type, quantity: q }];
  });
  if (!deliverables.length) return { error: "Pick at least one deliverable" };

  // Reuse the creator's own brand record by name; sample brands are never reused.
  const { data: existing } = await db.from("brands").select("id").eq("is_sample", false).ilike("name", brandName).limit(1).maybeSingle();
  const brandRow = {
    name: brandName, state: brandState.name, state_code: brandState.code, gstin: brandGstin || null,
    contact_name: contactName || null, contact_email: contactEmail || null, contact_whatsapp: contactWa || null,
    agency_name: paidBy === "agency" ? agency : null, legal_name: str(f.get("brand_legal")) || null,
  };
  let brandId: string;
  if (existing) {
    brandId = existing.id;
    await db.from("brands").update(brandRow).eq("id", brandId);
  } else {
    const { data: b, error } = await db.from("brands").insert(brandRow).select("id").single();
    if (error || !b) return { error: "Could not save the brand: " + error?.message };
    brandId = b.id;
  }

  const { data: deal, error } = await db.from("deals").insert({
    brand_id: brandId, paid_by: paidBy, fee_paise: fee, advance_paise: advance,
    advance_received_at: advReceived ? todayIST() : null, go_live_date: goLive, terms_days: terms, status: "draft",
    gst_mode: gstMode, tds_rate: tdsRate,
  }).select("id").single();
  if (error || !deal) return { error: "Could not save the deal: " + error?.message };

  const [r1, r2] = await Promise.all([
    db.from("deal_deliverables").insert(deliverables.map((d) => ({ ...d, deal_id: deal.id }))),
    db.from("usage_rights").insert({
      deal_id: deal.id, enabled: usageOn,
      duration: usageOn ? usageDuration : null,
      scope: usageOn ? str(f.get("usage_scope")) || "organic_paid" : null,
    }),
  ]);
  if (r1.error || r2.error) {
    await db.from("deals").delete().eq("id", deal.id);
    return { error: "Could not save deliverables: " + (r1.error ?? r2.error)?.message };
  }
  if (advReceived) await audit(db, user.id, "advance_recorded", "deal", deal.id, { amount_paise: advance });

  redirect(f.get("intent") === "agreement" ? `/deals/${deal.id}/agreement` : `/deals/${deal.id}?t=${encodeURIComponent("Deal saved")}`);
}

export async function markAdvanceReceived(dealId: string) {
  const { db, user } = await requireProfile();
  const { data } = await db.from("deals").update({ advance_received_at: todayIST() })
    .eq("id", dealId).is("advance_received_at", null).select("advance_paise").maybeSingle();
  if (data) await audit(db, user.id, "advance_recorded", "deal", dealId, { amount_paise: data.advance_paise });
  redirect(`/deals/${dealId}?t=${encodeURIComponent("Advance marked as received")}`);
}
