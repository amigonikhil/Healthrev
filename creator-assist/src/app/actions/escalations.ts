"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { getTax, loadDeal, requireProfile } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { viewDeal } from "@/lib/deal-view";
import { noticeText } from "@/lib/notice";
import { noticeFor } from "@/lib/notice-data";

export type EscState = { error?: string } | undefined;

/** Lawyer notice: saves the draft to the review queue. Nothing goes to the brand. */
export async function submitLawyerNotice(dealId: string, _: EscState, f: FormData): Promise<EscState> {
  if (f.get("confirm") !== "on") return { error: "Please confirm the facts are correct" };
  const { db, user, profile } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal?.invoice) return { error: "There's no invoice on this deal yet" };
  const v = viewDeal(deal, profile, await getTax(db), todayIST());
  const { data, error } = await db.from("escalations").insert({
    deal_id: deal.id, type: "lawyer_notice", draft: noticeText(noticeFor(v, profile)), status: "in_review", is_sample: deal.is_sample,
  }).select("id").single();
  if (error || !data) return { error: "Could not save: " + error?.message };
  await db.from("deals").update({ status: "escalated" }).eq("id", deal.id);
  await audit(db, user.id, "escalation_created", "escalation", data.id, { type: "lawyer_notice" });
  redirect(`/deals/${deal.id}/notice/sent`);
}

/** MSME Samadhaan: records the intent; the creator files on the government portal themselves. */
export async function startSamadhaan(dealId: string) {
  const { db, user } = await requireProfile();
  const deal = await loadDeal(db, dealId);
  if (!deal) return;
  const { data } = await db.from("escalations").insert({ deal_id: deal.id, type: "msme_samadhaan", status: "draft", is_sample: deal.is_sample }).select("id").single();
  await audit(db, user.id, "escalation_created", "escalation", data?.id, { type: "msme_samadhaan" });
}
