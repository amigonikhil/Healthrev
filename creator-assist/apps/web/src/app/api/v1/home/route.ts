import { route } from "@/server/http";
import { home } from "@/server/deals";

export const GET = route((ctx) => home(ctx));
