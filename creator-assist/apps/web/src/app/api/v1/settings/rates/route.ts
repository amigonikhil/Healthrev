import type { RatesInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { saveRates } from "@/server/settings";

export const PUT = route(async (ctx, req) => ({ message: await saveRates(ctx, await body<RatesInput>(req)) }));
