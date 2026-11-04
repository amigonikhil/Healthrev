"use server";

import { redirect } from "next/navigation";
import { parseRupees } from "@creator-assist/shared/money";
import { str } from "@creator-assist/shared/validate";
import { webCtx } from "@/server/context";
import { formError } from "@/server/forms";
import { recordPayment as record } from "@/server/invoices";

export type PayState = { error?: string } | undefined;

export async function recordPayment(dealId: string, _: PayState, f: FormData): Promise<PayState> {
  const ctx = await webCtx();
  let r: Awaited<ReturnType<typeof record>>;
  try {
    r = await record(ctx, dealId, {
      amountPaise: parseRupees(str(f.get("amount"))), tdsPaise: parseRupees(str(f.get("tds")) || "0"),
      receivedOn: str(f.get("date")) || undefined, utr: str(f.get("utr")) || null, form16a: f.get("form16a") === "on",
    });
  } catch (e) {
    return formError(e);
  }
  redirect(`/deals/${dealId}/paid?amt=${r.tdsPaise}&s=${r.settled ? 1 : 0}`);
}
