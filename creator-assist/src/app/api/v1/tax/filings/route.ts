import type { Filing } from "@creator-assist/shared/types";
import { body, route } from "@/server/http";
import { sendFilingData } from "@/server/tax";

export const POST = route(async (ctx, req) => ({ message: await sendFilingData(ctx, await body<{ type: Filing["type"]; period: string; due: string }>(req)) }));
