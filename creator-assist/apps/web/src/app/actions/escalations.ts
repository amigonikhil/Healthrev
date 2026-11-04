"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { webCtx } from "@/server/context";
import { bookLegalCall as book, emailLegalNotice as emailNotice, logNoticeWhatsApp as logWa, startSamadhaan as samadhaan } from "@/server/escalations";
import { formError } from "@/server/forms";

/** WhatsApp is click-to-send: the creator presses send; this only logs it. */
export async function logNoticeWhatsApp(dealId: string) {
  await logWa(await webCtx(), dealId);
  revalidatePath(`/deals/${dealId}`);
}

/** Emails the notice PDF to the brand. Sample deals go to the creator instead. */
export async function emailLegalNotice(dealId: string): Promise<string> {
  const message = await emailNotice(await webCtx(), dealId);
  revalidatePath(`/deals/${dealId}`);
  return message;
}

/** MSME Samadhaan: records the intent; the creator files on the government portal themselves. */
export async function startSamadhaan(dealId: string) {
  try { await samadhaan(await webCtx(), dealId); } catch { /* the portal still opens */ }
}

export type CallState = { error?: string } | undefined;

export async function bookLegalCall(dealId: string, _: CallState, f: FormData): Promise<CallState> {
  const ctx = await webCtx();
  let id: string;
  try {
    ({ id } = await book(ctx, dealId, {
      slot: String(f.get("slot") ?? ""), phone: String(f.get("phone") ?? ""), note: String(f.get("note") ?? ""), consent: f.get("consent") === "on",
    }));
  } catch (e) {
    return formError(e);
  }
  redirect(`/deals/${dealId}/legal-call/booked?b=${id}`);
}
