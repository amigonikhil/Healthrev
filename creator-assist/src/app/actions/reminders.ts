"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireProfile } from "@/lib/data";
import { sendEmail, textToHtml } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import type { Lang } from "@/lib/types";

type Target = { dealId?: string; brandId?: string; kind: "payment" | "tds"; stage: string; lang: Lang; message: string };

/**
 * Logs a reminder the creator sent themselves on WhatsApp (wa.me link) and, if
 * the ladder row for this stage is still pending, marks it as sent.
 */
export async function logWhatsAppReminder(t: Target) {
  const { db, user } = await requireProfile();
  const { data } = await db.from("reminders").insert({
    deal_id: t.dealId ?? null, brand_id: t.brandId ?? null, kind: t.kind, stage: t.stage, channel: "whatsapp", language: t.lang,
    message: t.message, scheduled_at: new Date().toISOString(), sent_at: new Date().toISOString(),
  }).select("id").single();
  await markLadderStageSent(t);
  await audit(db, user.id, "reminder_sent", "reminder", data?.id, { channel: "whatsapp", kind: t.kind, stage: t.stage });
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
}

export async function sendReminderEmail(t: Target & { cc: boolean }): Promise<string> {
  const { db, user, profile } = await requireProfile();
  const q = t.dealId
    ? db.from("deals").select("is_sample, brand:brands(name, contact_email, cc_email)").eq("id", t.dealId).single()
    : db.from("brands").select("is_sample, name, contact_email, cc_email").eq("id", t.brandId!).single();
  const { data } = await q;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brand: any = t.dealId ? (data as any)?.brand : data;
  if (!data || !brand) return "Not found";
  if (data.is_sample) {
    await audit(db, user.id, "reminder_sent", "reminder", null, { channel: "email", kind: t.kind, stage: t.stage, sample: true });
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
  await markLadderStageSent(t);
  await audit(db, user.id, "reminder_sent", "reminder", row?.id, { channel: "email", kind: t.kind, stage: t.stage });
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
  return `Email sent to ${brand.contact_email}`;
}

/** The automated ladder row for this stage counts as done once the creator sends it by hand. */
async function markLadderStageSent(t: Target) {
  const { db } = await requireProfile();
  let q = db.from("reminders").update({ sent_at: new Date().toISOString(), language: t.lang })
    .eq("kind", t.kind).eq("stage", t.stage).eq("channel", "email").is("sent_at", null).is("cancelled_at", null)
    .lte("scheduled_at", new Date(Date.now() + 36 * 3600_000).toISOString());
  q = t.dealId ? q.eq("deal_id", t.dealId) : q.eq("brand_id", t.brandId!);
  await q;
}

/** Schedules the TDS ladder (today, +7, +15) for a brand if none is pending. */
export async function scheduleTdsLadder(brandId: string, lang: Lang) {
  const { db } = await requireProfile();
  const { data: pending } = await db.from("reminders").select("id").eq("brand_id", brandId).eq("kind", "tds").is("sent_at", null).is("cancelled_at", null).limit(1);
  if (pending?.length) return;
  const day = 86_400_000;
  await db.from("reminders").insert([
    { brand_id: brandId, kind: "tds", stage: "follow_up", channel: "email", language: lang, scheduled_at: new Date(Date.now() + 7 * day).toISOString() },
    { brand_id: brandId, kind: "tds", stage: "firm", channel: "email", language: lang, scheduled_at: new Date(Date.now() + 15 * day).toISOString() },
  ]);
  revalidatePath(`/tax/remind/${brandId}`);
}
