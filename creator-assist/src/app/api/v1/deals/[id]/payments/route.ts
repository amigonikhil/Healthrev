import type { RecordPaymentInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { recordPayment } from "@/server/invoices";

export const POST = route(async (ctx, req, p) => recordPayment(ctx, p.id, await body<RecordPaymentInput>(req)));
