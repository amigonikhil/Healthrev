import { pdfResponse, route } from "@/server/http";
import { invoicePdf } from "@/server/invoices";

export const runtime = "nodejs";
export const GET = route(async (ctx, _req, p) => pdfResponse(await invoicePdf(ctx, p.id)));
