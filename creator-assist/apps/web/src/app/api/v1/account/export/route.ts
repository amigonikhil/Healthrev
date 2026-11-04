import { userRoute } from "@/server/http";
import { exportData } from "@/server/settings";

export const runtime = "nodejs";

/** Everything in the account as one JSON file (PAN and bank account decrypted for the owner). */
export const GET = userRoute(async (ctx) =>
  new Response(JSON.stringify(await exportData(ctx), null, 2), {
    headers: {
      "Content-Type": "application/json", "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="creator-assist-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  }),
);
