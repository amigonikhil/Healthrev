import { startSamadhaan } from "@/server/escalations";
import { route } from "@/server/http";

/** Notes that the creator is filing on the MSME Samadhaan portal (they file there themselves). */
export const POST = route(async (ctx, _req, p) => { await startSamadhaan(ctx, p.id); return { ok: true, portal: "https://samadhaan.msme.gov.in/" }; });
