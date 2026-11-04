import type { ReminderTarget } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { logWhatsAppReminder } from "@/server/reminders";

/** Logs a reminder the creator sent from their own WhatsApp (the app opens wa.me; nothing is sent from here). */
export const POST = route(async (ctx, req) => { await logWhatsAppReminder(ctx, await body<ReminderTarget>(req)); return { ok: true }; });
