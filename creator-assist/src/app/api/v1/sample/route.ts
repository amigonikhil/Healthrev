import { route } from "@/server/http";
import { clearSampleData, loadSampleData } from "@/server/settings";

/** Load the demo deals (marked as sample). */
export const POST = route(async (ctx) => ({ message: await loadSampleData(ctx) }));
/** Remove only the sample rows. */
export const DELETE = route(async (ctx) => ({ message: await clearSampleData(ctx) }));
