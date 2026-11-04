import type { LegalCallInput } from "@creator-assist/shared/api";
import { bookLegalCall } from "@/server/escalations";
import { body, route } from "@/server/http";

export const POST = route(async (ctx, req, p) => bookLegalCall(ctx, p.id, await body<LegalCallInput>(req)));
