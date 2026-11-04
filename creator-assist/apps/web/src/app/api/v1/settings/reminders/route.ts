import type { ReminderSettingsInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { saveReminderSettings } from "@/server/settings";

export const PUT = route(async (ctx, req) => ({ message: await saveReminderSettings(ctx, await body<ReminderSettingsInput>(req)) }));
