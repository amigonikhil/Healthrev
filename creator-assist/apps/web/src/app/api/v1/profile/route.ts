import type { OnboardInput, UpdateProfileInput } from "@creator-assist/shared/api";
import { body, userRoute } from "@/server/http";
import { clientProfile, onboard, updateProfile } from "@/server/profile";

/** Onboarding: creates the creator's profile (PAN and bank account are stored encrypted). */
export const POST = userRoute(async (ctx, req) => ({ profile: clientProfile(await onboard(ctx, await body<OnboardInput>(req))) }));
/** Edit profile. A blank PAN or bank account keeps the stored one. */
export const PATCH = userRoute(async (ctx, req) => ({ profile: clientProfile(await updateProfile(ctx, await body<UpdateProfileInput>(req))) }));
