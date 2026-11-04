import { route } from "@/server/http";
import { markAdvanceReceived } from "@/server/deals";

export const POST = route(async (ctx, _req, p) => { await markAdvanceReceived(ctx, p.id); return { ok: true }; });
