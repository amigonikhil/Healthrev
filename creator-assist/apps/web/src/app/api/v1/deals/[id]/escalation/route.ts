import { route } from "@/server/http";
import { escalateView } from "@/server/escalations";

export const GET = route(async (ctx, _req, p) => {
  const { sentNotice, callSlot, claim } = await escalateView(ctx, p.id);
  return { sentNotice, callSlot, claim };
});
