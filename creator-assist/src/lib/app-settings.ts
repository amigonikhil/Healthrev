import "server-only";
import { DEFAULT_TEMPLATES, type ReminderTemplates } from "./messages";
import { SUPABASE_URL } from "./env";
import type { TaxConfig } from "./calc";
import { createAdminClient } from "./supabase/admin";

// Admin-editable defaults (ADMIN.md §9). Stored in app_settings; service role only.
export type TaxDefaults = { gst_rate: number; tds_rate: number; rbi_bank_rate: number; msme_multiple: number };
export type { ReminderTemplates } from "./messages";

export async function getSetting<T>(key: string): Promise<T | null> {
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", key).maybeSingle();
    return (data?.value as T) ?? null;
  } catch {
    return null;
  }
}

/** Reminder wording: admin-edited templates, else the built-in ones. */
export async function reminderTemplates(): Promise<ReminderTemplates> {
  return (await getSetting<ReminderTemplates>("reminder_templates")) ?? DEFAULT_TEMPLATES;
}

export type RateDefaults = Pick<TaxConfig, "gst_rate" | "tds_rate" | "rbi_bank_rate" | "msme_multiple" | "late_interest_rate" | "late_interest_period" | "notice_legal_fee_paise">;

/**
 * What "Reset to default" in Settings > Rates goes back to: the tax_config column defaults
 * (read from the database's own schema, so nothing is hardcoded here), with the admin's
 * defaults for new creators on top. Null if the schema can't be read; the button is then hidden.
 */
export async function rateDefaults(): Promise<RateDefaults | null> {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, next: { revalidate: 3600 } });
    const cols = (await res.json())?.definitions?.tax_config?.properties as Record<string, { default?: unknown }> | undefined;
    if (!cols) return null;
    const num = (k: string) => Number(cols[k]?.default);
    const db: RateDefaults = {
      gst_rate: num("gst_rate"), tds_rate: num("tds_rate"), rbi_bank_rate: num("rbi_bank_rate"), msme_multiple: num("msme_multiple"),
      late_interest_rate: num("late_interest_rate"), late_interest_period: cols.late_interest_period?.default === "year" ? "year" : "week",
      notice_legal_fee_paise: num("notice_legal_fee_paise"),
    };
    if (Object.values(db).some((v) => typeof v === "number" && !Number.isFinite(v))) return null;
    return { ...db, ...((await getSetting<TaxDefaults>("tax_defaults")) ?? {}) };
  } catch {
    return null;
  }
}
