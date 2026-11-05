import "server-only";
import type { AiCallInput } from "@creator-assist/shared/api";
import { parseAis } from "@creator-assist/shared/ais";
import { fyOf, todayIST } from "@creator-assist/shared/dates";
import { taxHub, upcomingFilings } from "@creator-assist/shared/tax";
import type { AisEntry, Filing } from "@creator-assist/shared/types";
import { TAN_RE } from "@creator-assist/shared/validate";
import { audit } from "@/lib/audit";
import { fail, track, type ProfileCtx } from "./context";
import { listDeals } from "./deals";
import { flagOn } from "./misc";

/** Tax hub: income, GST, TDS by brands vs TDS in AIS, mismatches by brand, and filings coming up. */
export async function taxHubView(ctx: ProfileCtx) {
  const { views, today } = await listDeals(ctx);
  const [{ data: ais }, { data: filings }] = await Promise.all([
    ctx.db.from("ais_entries").select("*"),
    ctx.db.from("filings").select("*"),
  ]);
  const hub = taxHub(views, (ais ?? []) as AisEntry[], today);
  return {
    today, hub,
    cards: upcomingFilings(views, ctx.profile, (filings ?? []) as Filing[], today, hub),
    missing: hub.payers.filter((p) => p.missing > 0),
    filesWith: ctx.profile.files_with,
    aisUpdatedAt: ctx.profile.ais_updated_at,
  };
}

export async function setFiler(ctx: ProfileCtx, who: "creator_assist" | "own_ca"): Promise<void> {
  if (who !== "creator_assist" && who !== "own_ca") fail(400, "Choose who files for you");
  await ctx.db.from("profiles").update({ files_with: who }).eq("id", ctx.user.id);
  await ctx.db.from("filings").update({ handled_by: who }).is("data_sent_at", null);
  await track(ctx, "filing_option_chosen", { props: { who } });
}

const FILING_TYPES: Filing["type"][] = ["gstr1", "gstr3b", "advance_tax", "itr"];

/** Marks a filing's data as handed over to whoever files for the creator. Returns a toast message. */
export async function sendFilingData(ctx: ProfileCtx, input: { type: Filing["type"]; period: string; due: string }): Promise<string> {
  if (!FILING_TYPES.includes(input.type) || !input.period || !/^\d{4}-\d{2}-\d{2}$/.test(input.due)) fail(400, "Unknown filing");
  const { db, profile } = ctx;
  // Filing through Creator Assist is behind the file_with_us flag; while it's off the
  // creator's own CA handles every filing.
  const to = (await flagOn("file_with_us")) ? profile.files_with : "own_ca";
  const { error } = await db.from("filings").upsert({
    type: input.type, period: input.period, due_date: input.due, handled_by: to, status: "ready", data_sent_at: new Date().toISOString(),
  }, { onConflict: "user_id,type,period" });
  if (error) return "Could not save: " + error.message;
  await audit(db, ctx.user.id, "filing_data_sent", "filing", null, { type: input.type, period: input.period, to });
  await track(ctx, "filing_data_sent", { props: { type: input.type, period: input.period } });
  return to === "own_ca" ? "Marked as sent to your CA." : "Marked as sent to Creator Assist. Book your call to finish the return.";
}

/**
 * Stores an AIS JSON download and, when it can be read, replaces this year's uploaded
 * AIS lines with it (each download is cumulative for the year). Returns a summary.
 */
export async function uploadAis(ctx: ProfileCtx, file: { name: string; text: string; size: number }, fyIn?: string): Promise<string> {
  const { db, user } = ctx;
  const fy = (fyIn ?? "").trim() || fyOf(todayIST());
  if (!file.size) fail(400, "Choose your AIS JSON file");
  if (file.size > 4 * 1024 * 1024) fail(400, "That file is too large (max 4 MB)");

  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  await db.storage.from("ais").upload(path, new Blob([file.text], { type: "application/json" }), { contentType: "application/json" });

  let lines: ReturnType<typeof parseAis> = [];
  try { lines = parseAis(JSON.parse(file.text)); } catch { /* stored; manual entry instead */ }
  if (lines.length) {
    await db.from("ais_entries").delete().eq("fy", fy).eq("source", "upload");
    await db.from("ais_entries").insert(lines.map((l) => ({ ...l, fy, source: "upload", file_path: path })));
  }
  await db.from("profiles").update({ ais_updated_at: new Date().toISOString() }).eq("id", user.id);
  await audit(db, user.id, "ais_uploaded", "ais", null, { fy, entries: lines.length });
  await track(ctx, "ais_uploaded", { props: { fy, entries: lines.length } });
  if (!lines.length) {
    await db.from("ais_uploads").insert({ fy, file_path: path, parsed: false });
    return "File saved, but we couldn't read TDS lines from it. Add them by hand below.";
  }

  const { hub } = await taxHubView(ctx);
  const missing = hub.payers.filter((p) => p.missing > 0).length;
  await db.from("ais_uploads").insert({ fy, file_path: path, parsed: true, entries: lines.length, mismatches: missing });
  return `AIS updated · ${lines.length} deductor${lines.length === 1 ? "" : "s"} read · ${hub.payers.length - missing} matched, ${missing} missing`;
}

export async function addAisEntry(ctx: ProfileCtx, input: { deductor: string; tan?: string | null; amountPaise: number }): Promise<string> {
  const name = (input.deductor ?? "").trim();
  const tan = (input.tan ?? "").trim().toUpperCase();
  const amount = input.amountPaise;
  if (!name) fail(400, "Enter the deductor's name as shown in AIS");
  if (tan && !TAN_RE.test(tan)) fail(400, "TAN should look like ABCD12345E");
  if (!Number.isFinite(amount) || amount <= 0) fail(400, "Enter the TDS amount");
  await ctx.db.from("ais_entries").insert({ fy: fyOf(todayIST()), deductor_name: name, tan: tan || null, amount_paise: amount, source: "manual" });
  await ctx.db.from("profiles").update({ ais_updated_at: new Date().toISOString() }).eq("id", ctx.user.id);
  return "AIS entry added";
}

/** "File with us": how much data is ready for the return. */
export async function fileWithUsView(ctx: ProfileCtx) {
  const { views, today } = await listDeals(ctx);
  const { data: ais } = await ctx.db.from("ais_entries").select("*");
  return { today, hub: taxHub(views, (ais ?? []) as AisEntry[], today) };
}

export async function bookAiCall(ctx: ProfileCtx, input: AiCallInput): Promise<{ id: string }> {
  const slot = (input.slot ?? "").trim();
  const phone = (input.phone ?? "").trim();
  if (!slot || Number.isNaN(Date.parse(slot))) fail(400, "Pick a time slot");
  if (phone.replace(/\D/g, "").length < 10) fail(400, "Enter a phone number we can call");
  if (!input.consent) fail(400, "Please give consent to share your tax data with the filing CA");
  const { data, error } = await ctx.db.from("ai_call_bookings").insert({ slot, language: (input.language ?? "").trim() || "English", phone, consent: true }).select("id").single();
  if (error || !data) fail(500, "Could not book: " + error?.message);
  await audit(ctx.db, ctx.user.id, "ai_call_booked", "ai_call_booking", data.id, { slot });
  await track(ctx, "ai_call_booked");
  return { id: data.id };
}

export async function aiCallBooking(ctx: ProfileCtx, id: string): Promise<{ slot: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.db.from("ai_call_bookings").select("slot").eq("id", id).maybeSingle();
  return data;
}
