import type { CreateDealInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { createDeal, listDeals } from "@/server/deals";

export const GET = route(async (ctx) => {
  const { today, views } = await listDeals(ctx);
  return { today, deals: views };
});
export const POST = route(async (ctx, req) => createDeal(ctx, await body<CreateDealInput>(req)));
