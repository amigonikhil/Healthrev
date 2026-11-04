import { fail } from "@/server/context";
import { route } from "@/server/http";
import { aiCallBooking } from "@/server/tax";

export const GET = route(async (ctx, _req, p) => (await aiCallBooking(ctx, p.id)) ?? fail(404, "Booking not found", "not_found"));
