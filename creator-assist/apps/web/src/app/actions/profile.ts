"use server";

import { redirect } from "next/navigation";
import type { ProfileInput } from "@creator-assist/shared/api";
import { str } from "@creator-assist/shared/validate";
import { webSession } from "@/server/context";
import { formError } from "@/server/forms";
import { onboard, updateProfile as update } from "@/server/profile";

export type FormState = { error?: string } | undefined;

const profileInput = (f: FormData): ProfileInput & { pan: string; bankAccount: string } => ({
  name: str(f.get("name")), state: str(f.get("state")), pan: str(f.get("pan")), gstin: str(f.get("gstin")), udyam: str(f.get("udyam")),
  bankAccount: str(f.get("bank_account")), ifsc: str(f.get("ifsc")), upi: str(f.get("upi")), email: str(f.get("email")),
  handle: str(f.get("handle")), city: str(f.get("city")), address: str(f.get("address")),
});

export async function createProfile(_: FormState, f: FormData): Promise<FormState> {
  const ctx = await webSession();
  try {
    await onboard(ctx, { ...profileInput(f), consent: f.get("consent") === "on", phone: str(f.get("phone")) });
  } catch (e) {
    return formError(e);
  }
  redirect("/home");
}

export async function updateProfile(_: FormState, f: FormData): Promise<FormState> {
  const ctx = await webSession();
  try {
    await update(ctx, { ...profileInput(f), invoicePrefix: str(f.get("invoice_prefix")) });
  } catch (e) {
    return formError(e);
  }
  redirect("/settings?t=" + encodeURIComponent("Profile saved"));
}
