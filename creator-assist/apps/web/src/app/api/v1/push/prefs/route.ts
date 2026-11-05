import type { PushKind } from "@creator-assist/shared/types";
import { body, route } from "@/server/http";
import { savePushPrefs } from "@/server/push";

/** Which notifications to send `{ prefs: { whatsapp_due: true, … } }`. */
export const PUT = route(async (ctx, req) => ({ prefs: await savePushPrefs(ctx, (await body<{ prefs: Partial<Record<PushKind, boolean>> }>(req)).prefs) }));
