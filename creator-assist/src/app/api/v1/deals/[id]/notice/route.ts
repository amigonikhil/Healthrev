import { route } from "@/server/http";
import { noticeView } from "@/server/escalations";

/** The legal notice as it would be sent today, and how to send it. */
export const GET = route(async (ctx, _req, p) => {
  const { notice, waHref, emailTo } = await noticeView(ctx, p.id);
  return { notice, waHref, emailTo };
});
