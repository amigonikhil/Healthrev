import { publicRoute } from "@/server/http";
import { appConfig } from "@/server/misc";

/** Feature flags and the minimum supported app version, read when an app starts. */
export const GET = publicRoute(async () => appConfig());
