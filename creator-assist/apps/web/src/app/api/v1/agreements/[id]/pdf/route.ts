import { agreementPdf } from "@/server/agreements";
import { pdfResponse, route } from "@/server/http";

export const runtime = "nodejs";
export const GET = route(async (ctx, _req, p) => pdfResponse(await agreementPdf(ctx, p.id)));
