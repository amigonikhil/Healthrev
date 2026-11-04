import { route } from "@/server/http";
import { brands } from "@/server/deals";

export const GET = route(async (ctx) => {
  const { today, rows } = await brands(ctx);
  return { today, brands: rows };
});
