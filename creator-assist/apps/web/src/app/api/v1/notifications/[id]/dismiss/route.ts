import { route } from "@/server/http";
import { dismissNotification } from "@/server/misc";

export const POST = route(async (ctx, _req, p) => { await dismissNotification(ctx, p.id); return { ok: true }; });
