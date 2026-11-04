import { body, userRoute } from "@/server/http";
import { deleteAccount } from "@/server/settings";

/** Permanently deletes the account and all its data. Body: { "confirm": "DELETE" }. */
export const DELETE = userRoute(async (ctx, req) => {
  await deleteAccount(ctx, (await body<{ confirm: string }>(req)).confirm);
  return { ok: true };
});
