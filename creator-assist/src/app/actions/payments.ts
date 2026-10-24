"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { loadDeal, requireProfile } from "@/lib/data";
import { addDays, nineAmIST, todayIST } from "@/lib/dates";
import { form16aMessage } from "@/lib/messages";
import { parseRupees } from "@/lib/money";
import { str } from "@/lib/validate";

export type PayState = { error?: string } | undefined;

export async function recordPayment(dealId: string, _: PayState, f: FormData): Promise<PayState> {
  const { db, user, profile } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal?.invoice) return { error: "Generate the invoice before recording a payment" };
  const inv = deal.invoice;

  const amount = parseRupees(str(f.get("amount")));
  const tds = parseRupees(str(f.get("tds")) || "0");
  const date = str(f.get("date")) || todayIST();
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter the amount received" };
  if (!Number.isFinite(tds) || tds < 0) return { error: "TDS should be a number (0 if none)" };
  if (amount + tds <= 0) return { error: "Enter the amount received or TDS" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) return { error: "Date received can't be in the future" };

  const paidBefore = inv.payments.reduce((a, p) => a + p.amount_paise + p.tds_paise, 0);
  const remaining = inv.balance_due_paise - paidBefore - amount - tds;

  const { data: pay, error } = await db.from("payments").insert({
    invoice_id: inv.id, amount_paise: amount, tds_paise: tds, received_on: date, utr: str(f.get("utr")) || null, is_sample: deal.is_sample,
  }).select("id").single();
  if (error || !pay) return { error: "Could not save the payment: " + error?.message };

  const settled = remaining <= 0;
  await db.from("deals").update({ status: settled ? "paid" : "partially_paid" }).eq("id", deal.id);
  if (settled) {
    // Saving a full payment cancels any reminders still waiting to go out.
    await db.from("reminders").update({ cancelled_at: new Date().toISOString() })
      .eq("deal_id", deal.id).eq("kind", "payment").is("sent_at", null).is("cancelled_at", null);
  }
  if (tds > 0 && f.get("form16a") === "on") {
    await db.from("reminders").insert({
      deal_id: deal.id, kind: "tds", stage: "form16a", channel: "email", language: profile.language, is_sample: deal.is_sample,
      message: form16aMessage({ contact: deal.brand.contact_name ?? "", amount: tds, invoiceNo: inv.number, creator: profile.name }),
      scheduled_at: nineAmIST(addDays(todayIST(), 7)),
    });
  }
  await audit(db, user.id, "payment_recorded", "payment", pay.id, { amount_paise: amount, tds_paise: tds, settled });
  redirect(`/deals/${deal.id}/paid?amt=${tds}&s=${settled ? 1 : 0}`);
}
