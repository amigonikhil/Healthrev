"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireProfile } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SetState = { error?: string; ok?: string } | undefined;

const num = (v: FormDataEntryValue | null) => parseFloat(String(v ?? "").trim());

export async function saveRates(_: SetState, f: FormData): Promise<SetState> {
  const { db, user } = await requireProfile();
  const rates = { gst_rate: num(f.get("gst_rate")), tds_rate: num(f.get("tds_rate")), rbi_bank_rate: num(f.get("rbi_bank_rate")), msme_multiple: num(f.get("msme_multiple")) };
  for (const [k, v] of Object.entries(rates)) {
    if (!Number.isFinite(v) || v < 0 || v > (k === "msme_multiple" ? 10 : 100)) return { error: `Check the ${k.replace(/_/g, " ")}` };
  }
  const { error } = await db.from("tax_config").upsert({ user_id: user.id, ...rates }, { onConflict: "user_id" });
  if (error) return { error: error.message };
  await audit(db, user.id, "settings_updated", "tax_config", null, rates);
  return { ok: "Rates saved. New deals and invoices use them; existing invoices keep their rates." };
}

export async function saveReminderSettings(_: SetState, f: FormData): Promise<SetState> {
  const { db, user } = await requireProfile();
  const ladder = String(f.get("ladder") ?? "").split(/[^\d]+/).filter(Boolean).map(Number);
  if (!ladder.length || ladder.length > 6 || ladder.some((d) => d > 120) || ladder.some((d, i) => i && d <= ladder[i - 1])) {
    return { error: "Ladder should be up to 6 increasing day counts, e.g. 0, 7, 15, 30" };
  }
  const terms = Number(f.get("terms"));
  const { error } = await db.from("profiles").update({
    reminder_ladder: ladder, remind_whatsapp: f.get("whatsapp") === "on", remind_email: f.get("email") === "on",
    language: ["en", "te", "hi"].includes(String(f.get("language"))) ? f.get("language") : "en",
    default_terms_days: [30, 45, 60].includes(terms) ? terms : 45,
  }).eq("id", user.id);
  if (error) return { error: error.message };
  await audit(db, user.id, "settings_updated", "profile", user.id, { section: "reminders", ladder });
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
