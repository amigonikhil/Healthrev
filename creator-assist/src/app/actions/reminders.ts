"use server";

import { revalidatePath } from "next/cache";
import type { ReminderTarget } from "@creator-assist/shared/api";
import type { Lang } from "@creator-assist/shared/types";
import { webCtx } from "@/server/context";
import { logWhatsAppReminder as logWa, scheduleTdsLadder as schedule, sendReminderEmail as sendEmail } from "@/server/reminders";

/** Logs a reminder the creator sent themselves on WhatsApp (wa.me link). */
export async function logWhatsAppReminder(t: ReminderTarget) {
  await logWa(await webCtx(), t);
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
}

export async function sendReminderEmail(t: ReminderTarget & { cc: boolean }): Promise<string> {
  const message = await sendEmail(await webCtx(), t);
  if (t.dealId) revalidatePath(`/deals/${t.dealId}`);
  return message;
}

/** Schedules the TDS ladder (+7, +15 days) for a brand if none is pending. */
export async function scheduleTdsLadder(brandId: string, lang: Lang) {
  await schedule(await webCtx(), brandId, lang);
  revalidatePath(`/tax/remind/${brandId}`);
}
