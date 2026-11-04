import { fail } from "@/server/context";
import { legalCallBooking } from "@/server/escalations";
import { route } from "@/server/http";

export const GET = route(async (ctx, _req, p) => (await legalCallBooking(ctx, p.id)) ?? fail(404, "Booking not found", "not_found"));
