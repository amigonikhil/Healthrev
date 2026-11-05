import { body, route } from "@/server/http";
import { registerPushToken, removePushToken } from "@/server/push";

/** Register this phone for push `{ token, platform }` (an Expo push token). */
export const POST = route(async (ctx, req) => { await registerPushToken(ctx, await body<{ token: string; platform: string }>(req)); return { ok: true }; });
/** Stop pushing to this phone `{ token }`. */
export const DELETE = route(async (ctx, req) => { await removePushToken(ctx, (await body<{ token: string }>(req)).token); return { ok: true }; });
