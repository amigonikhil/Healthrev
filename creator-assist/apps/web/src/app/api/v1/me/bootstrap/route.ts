import { userRoute } from "@/server/http";
import { bootstrap } from "@/server/profile";

/** Call once after sign-in: sets up the demo owner's account if this is them, then returns `me`. */
export const POST = userRoute((ctx) => bootstrap(ctx));
