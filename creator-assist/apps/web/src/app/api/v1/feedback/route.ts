import { body, publicRoute } from "@/server/http";
import { submitFeedback } from "@/server/misc";

/** Feedback from a signed-in creator, or anonymously from sign-in/onboarding. */
export const POST = publicRoute(async (ctx, req) => {
  await submitFeedback(ctx, await body<{ screen: string; message: string }>(req));
  return { ok: true };
});
