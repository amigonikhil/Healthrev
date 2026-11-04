import { route } from "@/server/http";
import { reminderView } from "@/server/reminders";

/** Reminder ladder, reminders sent by hand, today's stage and the message templates. */
export const GET = route(async (ctx, _req, p) => {
  const { ladder, manual, stage, templates } = await reminderView(ctx, p.id);
  return { ladder, manual, stage, templates };
});
