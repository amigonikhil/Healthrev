import { fail, parsePlatform } from "@/server/context";
import { sendEmailCode } from "@/server/auth";
import { body, publicRoute } from "@/server/http";

/** Emails a sign-in code (the email fallback to phone OTP). Rate limited per address. */
export const POST = publicRoute(async (_ctx, req) => {
  const r = await sendEmailCode((await body<{ email: string }>(req)).email ?? "", parsePlatform(req.headers.get("x-client-platform")));
  return r.ok ? { ok: true } : fail(r.error.startsWith("Too many") || r.error.startsWith("Please wait") ? 429 : 400, r.error);
});
