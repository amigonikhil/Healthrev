import { route } from "@/server/http";
import { getDeal } from "@/server/deals";

export const GET = route(async (ctx, _req, p) => {
  const { today, v } = await getDeal(ctx, p.id);
  return { today, deal: v };
});
