import { noticePdfFor } from "@/server/escalations";
import { pdfResponse, route } from "@/server/http";

export const runtime = "nodejs";
export const GET = route(async (ctx, _req, p) => pdfResponse(await noticePdfFor(ctx, p.id), "inline"));
