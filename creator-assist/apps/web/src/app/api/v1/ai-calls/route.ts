import type { AiCallInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { bookAiCall } from "@/server/tax";

export const POST = route(async (ctx, req) => bookAiCall(ctx, await body<AiCallInput>(req)));
