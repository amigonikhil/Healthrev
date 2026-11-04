import { route } from "@/server/http";
import { settingsView } from "@/server/settings";

export const GET = route(async (ctx) => {
  const { tax, rateDefaults, templates, isAdmin, hasSampleData } = await settingsView(ctx);
  return { tax, rateDefaults, templates, isAdmin, hasSampleData };
});
