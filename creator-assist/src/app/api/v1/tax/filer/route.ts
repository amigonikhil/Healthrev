import { body, route } from "@/server/http";
import { setFiler } from "@/server/tax";

export const PUT = route(async (ctx, req) => { await setFiler(ctx, (await body<{ who: "creator_assist" | "own_ca" }>(req)).who); return { ok: true }; });
