import "server-only";
import type { RatesInput, ReminderSettingsInput } from "@creator-assist/shared/api";
import { todayIST } from "@creator-assist/shared/dates";
import { REMIND_EVERY_HOURS } from "@creator-assist/shared/reminder-schedule";
import { rateDefaults, reminderTemplates } from "@/lib/app-settings";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { getTax } from "@/lib/data";
import { seedDemoData } from "@/lib/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, track, type Ctx, type ProfileCtx } from "./context";
import { me } from "./profile";

/** Everything the Settings screen shows: profile, rates (with their defaults), reminder copy, sample data. */
export async function settingsView(ctx: ProfileCtx) {
  const [m, tax, defaults, templates] = await Promise.all([me(ctx), getTax(ctx.db), rateDefaults(), reminderTemplates()]);
  return { profile: ctx.profile, tax, rateDefaults: defaults, templates, isAdmin: m.isAdmin, hasSampleData: m.hasSampleData };
}

export async function saveRates(ctx: ProfileCtx, input: RatesInput): Promise<string> {
  const rates = {
    gst_rate: input.gstRate, tds_rate: input.tdsRate, rbi_bank_rate: input.rbiBankRate,
    msme_multiple: input.msmeMultiple, late_interest_rate: input.lateInterestRate,
  };
  for (const [k, v] of Object.entries(rates)) {
    if (!Number.isFinite(v) || v < 0 || v > (k === "msme_multiple" ? 10 : 100)) fail(400, `Check the ${k.replace(/_/g, " ")}`);
  }
  const fee = input.noticeLegalFeePaise;
  if (!Number.isFinite(fee) || fee < 0 || fee > 100_000_000) fail(400, "Check the legal fee");
  const row = { ...rates, late_interest_period: input.lateInterestPeriod === "year" ? "year" : "week", notice_legal_fee_paise: fee };
  const { error } = await ctx.db.from("tax_config").upsert({ user_id: ctx.user.id, ...row }, { onConflict: "user_id" });
  if (error) fail(500, error.message);
  await audit(ctx.db, ctx.user.id, "settings_updated", "tax_config", null, row);
  return "Rates saved. New deals, agreements and invoices use them; ones already sent keep their rates.";
}

export async function saveReminderSettings(ctx: ProfileCtx, input: ReminderSettingsInput): Promise<string> {
  const every = Number(input.everyHours);
  if (!(REMIND_EVERY_HOURS as readonly number[]).includes(every)) fail(400, "Pick how often to remind brands");
  const terms = Number(input.termsDays);
  const { error } = await ctx.db.from("profiles").update({
    remind_every_hours: every, remind_whatsapp: !!input.whatsapp, remind_email: !!input.email,
    language: ["en", "te", "hi"].includes(input.language) ? input.language : "en",
    default_terms_days: [30, 45, 60].includes(terms) ? terms : 45,
  }).eq("id", ctx.user.id);
  if (error) fail(500, error.message);
  await audit(ctx.db, ctx.user.id, "settings_updated", "profile", ctx.user.id, { section: "reminders", every_hours: every });
  return "Reminder settings saved. They apply to invoices you generate from now on.";
}

/** Loads the demo deals into the creator's account (idempotent). Returns a toast message. */
export async function loadSampleData(ctx: ProfileCtx): Promise<string> {
  const { db, profile } = ctx;
  const seeded = await seedDemoData(db, { userId: ctx.user.id, profile, pan: decrypt(profile.pan_enc), tax: await getTax(db), today: todayIST() });
  if (seeded) {
    await audit(db, ctx.user.id, "sample_seeded", "profile", ctx.user.id);
    await track(ctx, "sample_loaded", { sample: true });
  }
  return seeded ? "Sample data loaded" : "Sample data is already loaded";
}

/** Removes only rows marked as sample data. */
export async function clearSampleData(ctx: ProfileCtx): Promise<string> {
  const { error } = await ctx.db.rpc("clear_sample");
  if (error) fail(500, "Could not clear sample data: " + error.message);
  await audit(ctx.db, ctx.user.id, "sample_cleared", "profile", ctx.user.id);
  await track(ctx, "sample_cleared", { sample: true });
  return "Sample data cleared";
}

const EXPORT_TABLES = ["brands", "deals", "deal_deliverables", "usage_rights", "agreements", "invoices", "payments", "reminders", "escalations", "ais_entries", "filings", "ai_call_bookings", "legal_call_bookings", "tax_config", "audit_log"] as const;

/** "Export my data": everything the user owns, with PAN and bank decrypted for them. RLS scopes every query. */
export async function exportData(ctx: Ctx): Promise<Record<string, unknown>> {
  const { data: profile } = await ctx.db.from("profiles").select("*").eq("id", ctx.user.id).maybeSingle();
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    note: "Money values are in paise (₹1 = 100 paise).",
    profile: profile && {
      ...profile, pan: decrypt(profile.pan_enc), bank_account: decrypt(profile.bank_account_enc), pan_enc: undefined, bank_account_enc: undefined,
    },
  };
  for (const t of EXPORT_TABLES) {
    const { data } = await ctx.db.from(t).select("*");
    out[t] = (data ?? []).map((r: Record<string, unknown>) => (t === "agreements" ? { ...r, otp_hash: undefined } : r));
  }
  await audit(ctx.db, ctx.user.id, "data_exported", "profile", ctx.user.id);
  return out;
}

/** Permanently deletes the account: stored files, then the auth user (every table cascades from it). */
export async function deleteAccount(ctx: Ctx, confirm: string): Promise<void> {
  if (String(confirm ?? "").trim().toUpperCase() !== "DELETE") fail(400, "Type DELETE to confirm");
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from("ais").list(ctx.user.id);
  if (files?.length) await admin.storage.from("ais").remove(files.map((x) => `${ctx.user.id}/${x.name}`));
  const { error } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (error) fail(500, "Could not delete the account: " + error.message);
}
