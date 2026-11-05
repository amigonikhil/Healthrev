import { body, route } from "@/server/http";
import { scheduleTdsLadder, tdsReminderView } from "@/server/reminders";

/**
 * TDS missing from AIS for this brand, the TDS reminders so far, and the creator's own PAN
 * (the reminder asks the brand to file TDS against it).
 */
export const GET = route(async (ctx, _req, p) => {
  const { payer, ladder, pan } = await tdsReminderView(ctx, p.id);
  return { payer, ladder, pan };
});
/** Schedules the TDS follow-ups (+7 and +15 days) if none are pending. */
export const POST = route(async (ctx, req, p) => {
  const { lang } = await body<{ lang: "en" | "te" | "hi" }>(req);
  await scheduleTdsLadder(ctx, p.id, ["en", "te", "hi"].includes(lang) ? lang : ctx.profile.language);
  return { ok: true };
});
