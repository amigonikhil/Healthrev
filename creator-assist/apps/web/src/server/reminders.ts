import "server-only";
import type { ReminderTarget } from "@creator-assist/shared/api";
import type { DealView } from "@creator-assist/shared/deal-view";
import type { ReminderTemplates } from "@creator-assist/shared/messages";
import { taxHub } from "@creator-assist/shared/tax";
import type { AisEntry, Lang, Reminder } from "@creator-assist/shared/types";
import { reminderTemplates } from "@/lib/app-settings";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { sendEmail, textToHtml } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { fail, track, type ProfileCtx } from "./context";
import { getDeal, listDeals } from "./deals";

/** Payment reminders for a deal: the automatic ladder, the ones sent by hand, and today's stage. */
export async function reminderView(ctx: ProfileCtx, dealId: string): Promise<{
  v: DealView; ladder: Reminder[]; manual: Reminder[]; stage: string; templates: ReminderTemplates;
}> {
  const [{ v }, templates] = await Promise.all([getDeal(ctx, dealId), reminderTemplates()]);
  const ladder = v.d.reminders.filter((r) => r.kind === "payment" && r.channel === "email").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const manual = v.d.reminders.filter((r) => r.kind === "payment" && r.channel === "whatsapp");
  // Current stage: the latest ladder step that has come due (or the first one).
  const due = ladder.filter((r) => r.scheduled_at <= new Date().toISOString());
  const stage = (due.at(-1) ?? ladder[0])?.stage ?? "friendly";
  return { v, ladder, manual, stage, templates };
}

const checkTarget = (t: ReminderTarget) => {
  if (!t.dealId === !t.brandId) fail(400, "Send a reminder for one deal or one brand");
  if (t.kind !== "payment" && t.kind !== "tds") fail(400, "Unknown reminder kind");
  if (!["en", "te", "hi"].includes(t.lang)) fail(400, "Unknown language");
  if (!t.message?.trim() || t.message.length > 4000) fail(400, "Write the reminder message");
};

/**
 * Logs a reminder the creator sent themselves on WhatsApp (wa.me link) and, if the
 * ladder row for this stage is still pending, marks it as sent.
 */
export async function logWhatsAppReminder(ctx: ProfileCtx, t: ReminderTarget): Promise<void> {
  checkTarget(t);
  const { db } = ctx;
  const { data } = await db.from("reminders").insert({
    deal_id: t.dealId ?? null, brand_id: t.brandId ?? null, kind: t.kind, stage: t.stage, channel: "whatsapp", language: t.lang,
    message: t.message, scheduled_at: new Date().toISOString(), sent_at: new Date().toISOString(),
  }).select("id").single();
  await markLadderStageSent(ctx, t);
  await audit(db, ctx.user.id, "reminder_sent", "reminder", data?.id, { channel: "whatsapp", kind: t.kind, stage: t.stage });
  const { data: owner } = t.dealId
    ? await db.from("deals").select("is_sample").eq("id", t.dealId).maybeSingle()
    : await db.from("brands").select("is_sample").eq("id", t.brandId!).maybeSingle();
  await track(ctx, "reminder_sent", { sample: !!owner?.is_sample, props: { channel: "whatsapp", kind: t.kind, deal_id: t.dealId ?? null } });
}

/** Emails a reminder to the brand now (with a read receipt). Returns what happened, for a toast. */
export async function sendReminderEmail(ctx: ProfileCtx, t: ReminderTarget & { cc: boolean }): Promise<string> {
  checkTarget(t);
  const { db, profile } = ctx;
  const q = t.dealId
    ? db.from("deals").select("is_sample, brand:brands(name, contact_email, cc_email)").eq("id", t.dealId).maybeSingle()
    : db.from("brands").select("is_sample, name, contact_email, cc_email").eq("id", t.brandId!).maybeSingle();
  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand: any = t.dealId ? (data as any)?.brand : data;
  if (!data || !brand) return "Not found";
  if (data.is_sample) {
    await audit(db, ctx.user.id, "reminder_sent", "reminder", null, { channel: "email", kind: t.kind, stage: t.stage, sample: true });
    await track(ctx, "reminder_sent", { sample: true, props: { channel: "email", kind: t.kind } });
    return "Sample deal: email not actually sent";
  }
  if (!brand.contact_email) return "Add a contact email for this brand first";

  const { data: row } = await db.from("reminders").insert({
    deal_id: t.dealId ?? null, brand_id: t.brandId ?? null, kind: t.kind, stage: t.stage, channel: "email", language: t.lang,
    message: t.message, scheduled_at: new Date().toISOString(),
  }).select("id").single();
  const pixel = row ? `<img src="${siteUrl()}/api/r/${row.id}" width="1" height="1" alt="" style="display:none">` : "";
  const r = await sendEmail({
    to: brand.contact_email, cc: t.cc && brand.cc_email ? [brand.cc_email] : undefined, replyTo: profile.email ?? undefined,
    subject: t.kind === "tds" ? `TDS not showing in AIS – ${profile.name}` : `Payment reminder – ${profile.name}`,
    text: t.message, html: textToHtml(t.message, pixel),
  });
  if (!r.sent) {
    if (row) await db.from("reminders").delete().eq("id", row.id);
    return `Email not sent: ${r.reason}`;
  }
  if (row) await db.from("reminders").update({ sent_at: new Date().toISOString() }).eq("id", row.id);
  await markLadderStageSent(ctx, t);
  await audit(db, ctx.user.id, "reminder_sent", "reminder", row?.id, { channel: "email", kind: t.kind, stage: t.stage });
  await track(ctx, "reminder_sent", { props: { channel: "email", kind: t.kind, deal_id: t.dealId ?? null } });
  return `Email sent to ${brand.contact_email}`;
}

/** The automated ladder row for this stage counts as done once the creator sends it by hand. */
async function markLadderStageSent(ctx: ProfileCtx, t: ReminderTarget) {
  let q = ctx.db.from("reminders").update({ sent_at: new Date().toISOString(), language: t.lang })
    .eq("kind", t.kind).eq("stage", t.stage).eq("channel", "email").is("sent_at", null).is("cancelled_at", null)
    .lte("scheduled_at", new Date(Date.now() + 36 * 3600_000).toISOString());
  q = t.dealId ? q.eq("deal_id", t.dealId) : q.eq("brand_id", t.brandId!);
  await q;
}

/** Schedules the TDS ladder (+7, +15 days) for a brand if none is pending. */
export async function scheduleTdsLadder(ctx: ProfileCtx, brandId: string, lang: Lang): Promise<void> {
  const { db } = ctx;
  const { data: pending } = await db.from("reminders").select("id").eq("brand_id", brandId).eq("kind", "tds").is("sent_at", null).is("cancelled_at", null).limit(1);
  if (pending?.length) return;
  const day = 86_400_000;
  await db.from("reminders").insert([
    { brand_id: brandId, kind: "tds", stage: "follow_up", channel: "email", language: lang, scheduled_at: new Date(Date.now() + 7 * day).toISOString() },
    { brand_id: brandId, kind: "tds", stage: "firm", channel: "email", language: lang, scheduled_at: new Date(Date.now() + 15 * day).toISOString() },
  ]);
}

/** A brand whose TDS is missing from AIS: what's missing, which invoices, and its TDS reminders so far. */
export async function tdsReminderView(ctx: ProfileCtx, brandId: string) {
  const { views, today } = await listDeals(ctx);
  const [{ data: ais }, { data: rems }] = await Promise.all([
    ctx.db.from("ais_entries").select("*"),
    ctx.db.from("reminders").select("*").eq("brand_id", brandId).eq("kind", "tds").order("scheduled_at"),
  ]);
  const payer = taxHub(views, (ais ?? []) as AisEntry[], today).payers.find((p) => p.brand.id === brandId);
  if (!payer) fail(404, "No TDS for this brand", "not_found");
  const p = ctx.profile;
  return { payer, ladder: (rems ?? []) as Reminder[], pan: decrypt(p.pan_enc) ?? p.pan_masked ?? "" };
}
