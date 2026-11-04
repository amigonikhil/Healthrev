import { body, route } from "@/server/http";
import { scheduleTdsLadder, tdsReminderView } from "@/server/reminders";

/** TDS missing from AIS for this brand, and the TDS reminders so far. */
export const GET = route(async (ctx, _req, p) => {
  const { payer, ladder } = await tdsReminderView(ctx, p.id);
  return { payer, ladder };
});
/** Schedules the TDS follow-ups (+7 and +15 days) if none are pending. */
export const POST = route(async (ctx, req, p) => {
  const { lang } = await body<{ lang: "en" | "te" | "hi" }>(req);
  await scheduleTdsLadder(ctx, p.id, ["en", "te", "hi"].includes(lang) ? lang : ctx.profile.language);
  return { ok: true };
});
