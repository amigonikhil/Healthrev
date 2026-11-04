import { route } from "@/server/http";
import { emailInvoice } from "@/server/invoices";

export const runtime = "nodejs";
export const POST = route(async (ctx, _req, p) => ({ message: await emailInvoice(ctx, p.id) }));
