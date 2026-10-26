import "server-only";
import { DEFAULT_TEMPLATES, type ReminderTemplates } from "./messages";
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
