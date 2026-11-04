"use server";

import { redirect } from "next/navigation";
import { parseRupees } from "@creator-assist/shared/money";
import type { Lang } from "@creator-assist/shared/types";
import { ApiError, webCtx } from "@/server/context";
import { signOutWeb } from "@/server/misc";
import { deleteAccount as remove, saveRates as rates, saveReminderSettings as reminders } from "@/server/settings";

export type SetState = { error?: string; ok?: string } | undefined;

const num = (v: FormDataEntryValue | null) => parseFloat(String(v ?? "").trim());
const settle = async (fn: () => Promise<string>): Promise<SetState> => {
  try {
    return { ok: await fn() };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
};

export async function saveRates(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await webCtx();
  return settle(() => rates(ctx, {
    gstRate: num(f.get("gst_rate")), tdsRate: num(f.get("tds_rate")), rbiBankRate: num(f.get("rbi_bank_rate")),
    msmeMultiple: num(f.get("msme_multiple")), lateInterestRate: num(f.get("late_interest_rate")),
    lateInterestPeriod: f.get("late_interest_period") === "year" ? "year" : "week",
    noticeLegalFeePaise: parseRupees(String(f.get("notice_legal_fee") ?? "0")),
  }));
}

export async function saveReminderSettings(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await webCtx();
  return settle(() => reminders(ctx, {
    everyHours: Number(f.get("every")), whatsapp: f.get("whatsapp") === "on", email: f.get("email") === "on",
    language: String(f.get("language")) as Lang, termsDays: Number(f.get("terms")),
  }));
}

export async function signOut() {
  await signOutWeb();
  redirect("/signin");
}

export async function deleteAccount(_: SetState, f: FormData): Promise<SetState> {
  const ctx = await webCtx();
  try {
    await remove(ctx, String(f.get("confirm") ?? ""));
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
  await signOutWeb();
  redirect("/signin");
}
