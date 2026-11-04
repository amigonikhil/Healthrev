"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { SendAgreementResult } from "@creator-assist/shared/api";
import { sendAgreement as send, sendSignOtp as sendOtp, signAgreement as sign } from "@/server/agreements";
import { ApiError, webCtx } from "@/server/context";

export type SendResult = ({ ok: true } & SendAgreementResult) | { ok: false; error: string };

/** Creates (or re-sends) the e-sign request for a deal. */
export async function sendAgreement(dealId: string, opts: { email: boolean; whatsapp: boolean }): Promise<SendResult> {
  try {
    const r = await send(await webCtx(), dealId, opts);
    revalidatePath(`/deals/${dealId}`);
    return { ok: true, ...r };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------- public signing (no login)

export async function sendSignOtp(token: string, email: string): Promise<{ ok: boolean; message: string }> {
  return sendOtp(token, email);
}

export type SignState = { error?: string } | undefined;

export async function signAgreement(token: string, _: SignState, f: FormData): Promise<SignState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const error = await sign(token, {
    name: String(f.get("name") ?? ""), designation: String(f.get("designation") ?? ""), otp: String(f.get("otp") ?? ""),
    accept: f.get("accept") === "on", whatsapp: f.get("whatsapp") === "on",
  }, ip);
  revalidatePath(`/s/${token}`);
  return error ? { error } : undefined;
}
