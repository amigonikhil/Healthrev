import type { ReminderTarget } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { sendReminderEmail } from "@/server/reminders";

export const POST = route(async (ctx, req) => ({ message: await sendReminderEmail(ctx, await body<ReminderTarget & { cc: boolean }>(req)) }));
