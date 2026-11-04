import { body, route } from "@/server/http";
import { addAisEntry } from "@/server/tax";

export const POST = route(async (ctx, req) => ({ message: await addAisEntry(ctx, await body<{ deductor: string; tan?: string; amountPaise: number }>(req)) }));
