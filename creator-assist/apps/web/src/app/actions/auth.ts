"use server";

import { sendEmailCode as send } from "@/server/auth";

/** Emails a sign-in code (see src/server/auth.ts). */
export async function sendEmailCode(rawEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return send(rawEmail);
}
