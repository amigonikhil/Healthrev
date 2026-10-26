"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireProfile } from "@/lib/data";
import { parseRupees } from "@/lib/money";
import { REMIND_EVERY_HOURS } from "@/lib/reminder-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetState = { error?: string; ok?: string } | undefined;

const num = (v: FormDataEntryValue | null) => parseFloat(String(v ?? "").trim());

export async function saveRates(_: SetState, f: FormData): Promise<SetState> {
  const { db, user } = await requireProfile();
  const rates = {
    gst_rate: num(f.get("gst_rate")), tds_rate: num(f.get("tds_rate")), rbi_bank_rate: num(f.get("rbi_bank_rate")),
    msme_multiple: num(f.get("msme_multiple")), late_interest_rate: num(f.get("late_interest_rate")),
  };
  for (const [k, v] of Object.entries(rates)) {
    if (!Number.isFinite(v) || v < 0 || v > (k === "msme_multiple" ? 10 : 100)) return { error: `Check the ${k.replace(/_/g, " ")}` };
  }
  const period = f.get("late_interest_period") === "year" ? "year" : "week";
  const fee = parseRupees(String(f.get("notice_legal_fee") ?? "0"));
  if (!Number.isFinite(fee) || fee < 0 || fee > 100_000_000) return { error: "Check the legal fee" };
  const row = { ...rates, late_interest_period: period, notice_legal_fee_paise: fee };
  const { error } = await db.from("tax_config").upsert({ user_id: user.id, ...row }, { onConflict: "user_id" });
  if (error) return { error: error.message };
  await audit(db, user.id, "settings_updated", "tax_config", null, row);
  return { ok: "Rates saved. New deals, agreements and invoices use them; ones already sent keep their rates." };
}

export async function saveReminderSettings(_: SetState, f: FormData): Promise<SetState> {
  const { db, user } = await requireProfile();
  const every = Number(f.get("every"));
  if (!(REMIND_EVERY_HOURS as readonly number[]).includes(every)) return { error: "Pick how often to remind brands" };
  const terms = Number(f.get("terms"));
  const { error } = await db.from("profiles").update({
    remind_every_hours: every, remind_whatsapp: f.get("whatsapp") === "on", remind_email: f.get("email") === "on",
    language: ["en", "te", "hi"].includes(String(f.get("language"))) ? f.get("language") : "en",
    default_terms_days: [30, 45, 60].includes(terms) ? terms : 45,
  }).eq("id", user.id);
  if (error) return { error: error.message };
  await audit(db, user.id, "settings_updated", "profile", user.id, { section: "reminders", every_hours: every });
  return { ok: "Reminder settings saved. They apply to invoices you generate from now on." };
}

export async function signOut() {
  const db = await createClient();
  await db.auth.signOut();
  redirect("/signin");
}

export async function deleteAccount(_: SetState, f: FormData): Promise<SetState> {
  if (String(f.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm" };
  const { db, user } = await requireProfile();
  const admin = createAdminClient();
  // Remove stored files, then the auth user; every table cascades from auth.users.
  const { data: files } = await admin.storage.from("ais").list(user.id);
  if (files?.length) await admin.storage.from("ais").remove(files.map((x) => `${user.id}/${x.name}`));
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { error: "Could not delete the account: " + error.message };
  await db.auth.signOut();
  redirect("/signin");
}
