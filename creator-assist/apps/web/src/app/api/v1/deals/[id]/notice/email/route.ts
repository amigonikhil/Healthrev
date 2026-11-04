import { emailLegalNotice } from "@/server/escalations";
import { route } from "@/server/http";

export const runtime = "nodejs";
export const POST = route(async (ctx, _req, p) => ({ message: await emailLegalNotice(ctx, p.id) }));
