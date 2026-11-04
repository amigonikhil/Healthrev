import { route } from "@/server/http";
import { taxHubView } from "@/server/tax";

export const GET = route(async (ctx) => {
  const { today, hub, cards, missing, filesWith, aisUpdatedAt } = await taxHubView(ctx);
  return { today, hub, cards, missing, filesWith, aisUpdatedAt };
});
