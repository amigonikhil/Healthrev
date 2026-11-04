"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRupees } from "@creator-assist/shared/money";
import type { Filing } from "@creator-assist/shared/types";
import { str } from "@creator-assist/shared/validate";
import { webCtx } from "@/server/context";
import { formError } from "@/server/forms";
import { addAisEntry as addEntry, bookAiCall as book, sendFilingData as sendData, setFiler as setWho, uploadAis as upload } from "@/server/tax";

export async function setFiler(who: "creator_assist" | "own_ca") {
  await setWho(await webCtx(), who);
  revalidatePath("/tax");
}

/** Marks a filing's data as handed over. Returns a toast message. */
export async function sendFilingData(type: Filing["type"], period: string, due: string): Promise<string> {
  const message = await sendData(await webCtx(), { type, period, due });
  revalidatePath("/tax");
  return message;
}

export type AisState = { message?: string; error?: string } | undefined;

export async function uploadAis(_: AisState, f: FormData): Promise<AisState> {
  const ctx = await webCtx();
  const file = f.get("file");
  try {
    if (!(file instanceof File) || file.size === 0) return { error: "Choose your AIS JSON file" };
    const message = await upload(ctx, { name: file.name, size: file.size, text: await file.text() }, str(f.get("fy")));
    revalidatePath("/tax");
    return { message };
  } catch (e) {
    return formError(e);
  }
}

export async function addAisEntry(_: AisState, f: FormData): Promise<AisState> {
  const ctx = await webCtx();
  try {
    const message = await addEntry(ctx, { deductor: str(f.get("deductor")), tan: str(f.get("tan")), amountPaise: parseRupees(str(f.get("amount"))) });
    revalidatePath("/tax");
    return { message };
  } catch (e) {
    return formError(e);
  }
}

export type BookState = { error?: string } | undefined;

export async function bookAiCall(_: BookState, f: FormData): Promise<BookState> {
  const ctx = await webCtx();
  let id: string;
  try {
    ({ id } = await book(ctx, { slot: str(f.get("slot")), phone: str(f.get("phone")), language: str(f.get("language")), consent: f.get("consent") === "on" }));
  } catch (e) {
    return formError(e);
  }
  redirect(`/tax/file/booked?id=${id}`);
}
