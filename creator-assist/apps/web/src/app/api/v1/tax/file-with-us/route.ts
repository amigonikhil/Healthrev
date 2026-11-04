import { route } from "@/server/http";
import { fileWithUsView } from "@/server/tax";

export const GET = route(async (ctx) => {
  const { hub } = await fileWithUsView(ctx);
  return { invoiceCount: hub.invoiceCount, brands: hub.brands };
});
