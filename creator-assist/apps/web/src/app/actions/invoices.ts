"use server";

import { redirect } from "next/navigation";
import { todayIST } from "@creator-assist/shared/dates";
import { webCtx } from "@/server/context";
import { formError } from "@/server/forms";
import { emailInvoice as email, generateInvoice as generate } from "@/server/invoices";

export type InvState = { error?: string } | undefined;

export async function generateInvoice(dealId: string, _: InvState, f: FormData): Promise<InvState> {
  const ctx = await webCtx();
  let r: Awaited<ReturnType<typeof generate>>;
  try {
    r = await generate(ctx, dealId, { invoiceDate: String(f.get("invoice_date") || todayIST()), email: f.get("email") === "on" });
  } catch (e) {
    return formError(e);
  }
  redirect(r.existed ? `/deals/${dealId}/invoice` : `/deals/${dealId}/invoice?t=${encodeURIComponent(r.message)}`);
}

/** "Send again": emails the invoice PDF to the brand. Returns a toast message. */
export async function emailInvoice(invoiceId: string): Promise<string> {
  return email(await webCtx(), invoiceId);
}
