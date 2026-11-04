import { logNoticeWhatsApp } from "@/server/escalations";
import { route } from "@/server/http";

/** Logs that the creator sent the notice from their own WhatsApp. */
export const POST = route(async (ctx, _req, p) => { await logNoticeWhatsApp(ctx, p.id); return { ok: true }; });
