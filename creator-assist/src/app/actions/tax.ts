"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseAis } from "@/lib/ais";
import { audit } from "@/lib/audit";
import { loadViews, requireProfile } from "@/lib/data";
import { fyOf, todayIST } from "@/lib/dates";
import { parseRupees } from "@/lib/money";
import { taxHub } from "@/lib/tax";
import type { AisEntry, Filing } from "@/lib/types";
import { str, TAN_RE, up } from "@/lib/validate";

export async function setFiler(who: "creator_assist" | "own_ca") {
  const { db, user } = await requireProfile();
  await db.from("profiles").update({ files_with: who }).eq("id", user.id);
  await db.from("filings").update({ handled_by: who }).is("data_sent_at", null);
  revalidatePath("/tax");
}

/** Beta: marks a filing's data as handed over. Nothing is actually filed or sent. */
export async function sendFilingData(type: Filing["type"], period: string, due: string): Promise<string> {
  const { db, user, profile } = await requireProfile();
  const { error } = await db.from("filings").upsert({
    type, period, due_date: due, handled_by: profile.files_with, status: "ready", data_sent_at: new Date().toISOString(),
  }, { onConflict: "user_id,type,period" });
  if (error) return "Could not save: " + error.message;
  await audit(db, user.id, "filing_data_sent", "filing", null, { type, period, to: profile.files_with });
  revalidatePath("/tax");
  return `Beta: marked as sent to ${profile.files_with === "own_ca" ? "your CA" : "Creator Assist"}. Nothing was actually filed.`;
}

export type AisState = { message?: string; error?: string } | undefined;

export async function uploadAis(_: AisState, f: FormData): Promise<AisState> {
  const { db, user } = await requireProfile();
  const file = f.get("file");
  const fy = str(f.get("fy")) || fyOf(todayIST());
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your AIS JSON file" };
  if (file.size > 4 * 1024 * 1024) return { error: "That file is too large (max 4 MB)" };

  const text = await file.text();
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await db.storage.from("ais").upload(path, new Blob([text], { type: "application/json" }), { contentType: "application/json" });

  let lines: ReturnType<typeof parseAis> = [];
  try { lines = parseAis(JSON.parse(text)); } catch { /* stored; manual entry below */ }
  if (lines.length) {
    // Each AIS download is cumulative for the year, so it replaces the last upload.
    await db.from("ais_entries").delete().eq("fy", fy).eq("source", "upload");
    await db.from("ais_entries").insert(lines.map((l) => ({ ...l, fy, source: "upload", file_path: path })));
  }
  await db.from("profiles").update({ ais_updated_at: new Date().toISOString() }).eq("id", user.id);
  await audit(db, user.id, "ais_uploaded", "ais", null, { fy, entries: lines.length });
  revalidatePath("/tax");
  if (!lines.length) return { message: "File saved, but we couldn't read TDS lines from it. Add them by hand below." };

  const { views, today } = await loadViews();
  const { data: ais } = await db.from("ais_entries").select("*");
  const hub = taxHub(views, (ais ?? []) as AisEntry[], today);
  const missing = hub.payers.filter((p) => p.missing > 0).length;
  return { message: `AIS updated · ${lines.length} deductor${lines.length === 1 ? "" : "s"} read · ${hub.payers.length - missing} matched, ${missing} missing` };
}

export async function addAisEntry(_: AisState, f: FormData): Promise<AisState> {
  const { db, user } = await requireProfile();
  const name = str(f.get("deductor"));
  const tan = up(f.get("tan"));
  const amount = parseRupees(str(f.get("amount")));
  if (!name) return { error: "Enter the deductor's name as shown in AIS" };
  if (tan && !TAN_RE.test(tan)) return { error: "TAN should look like ABCD12345E" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the TDS amount" };
  await db.from("ais_entries").insert({ fy: fyOf(todayIST()), deductor_name: name, tan: tan || null, amount_paise: amount, source: "manual" });
  await db.from("profiles").update({ ais_updated_at: new Date().toISOString() }).eq("id", user.id);
  revalidatePath("/tax");
  return { message: "AIS entry added" };
}

export type BookState = { error?: string } | undefined;

export async function bookAiCall(_: BookState, f: FormData): Promise<BookState> {
  const { db, user } = await requireProfile();
  const slot = str(f.get("slot"));
  const phone = str(f.get("phone"));
  if (!slot || Number.isNaN(Date.parse(slot))) return { error: "Pick a time slot" };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Enter a phone number we can call" };
  if (f.get("consent") !== "on") return { error: "Please give consent to share your tax data with the filing CA" };
  const { data, error } = await db.from("ai_call_bookings").insert({ slot, language: str(f.get("language")) || "English", phone, consent: true }).select("id").single();
  if (error || !data) return { error: "Could not book: " + error?.message };
  await audit(db, user.id, "ai_call_booked", "ai_call_booking", data.id, { slot });
  redirect(`/tax/file/booked?id=${data.id}`);
}
