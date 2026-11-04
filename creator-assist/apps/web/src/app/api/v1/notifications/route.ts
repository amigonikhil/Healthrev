import { route } from "@/server/http";
import { listNotifications } from "@/server/misc";

export const GET = route(async (ctx) => ({ notifications: await listNotifications(ctx) }));
