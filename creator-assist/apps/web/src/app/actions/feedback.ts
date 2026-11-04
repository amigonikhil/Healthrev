"use server";

import { ApiError, webOptionalCtx } from "@/server/context";
import { submitFeedback as submit } from "@/server/misc";

export async function submitFeedback(screen: string, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await submit(await webOptionalCtx(), { screen, message });
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    throw e;
  }
}
