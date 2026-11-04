import type { GenerateInvoiceInput } from "@creator-assist/shared/api";
import { body, route } from "@/server/http";
import { generateInvoice, invoiceView } from "@/server/invoices";

export const runtime = "nodejs";

/** The invoice, or a draft preview before it's generated. */
export const GET = route(async (ctx, _req, p) => {
  const { invoice, billTo } = await invoiceView(ctx, p.id);
  return { invoice, billTo };
});
/** Generate (number) the invoice, start reminders, optionally email it. */
export const POST = route(async (ctx, req, p) => {
  const { invoice, message, existed } = await generateInvoice(ctx, p.id, await body<GenerateInvoiceInput>(req));
  return { invoice, message, existed };
});
