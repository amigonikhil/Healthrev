import { userRoute } from "@/server/http";
import { me } from "@/server/profile";

export const GET = userRoute((ctx) => me(ctx));
