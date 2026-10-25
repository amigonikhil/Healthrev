import "server-only";
import { decrypt } from "./crypto";
import { istDate, todayIST } from "./dates";
import type { DealView } from "./deal-view";
import { buildNotice } from "./notice";
import type { Profile } from "./types";

/** The notice for a deal, dated when it was sent for review (or today, for the preview). */
export function noticeFor(v: DealView, profile: Profile) {
  const sent = v.d.escalations.filter((e) => e.type === "lawyer_notice").map((e) => e.created_at).sort().at(-1);
  const late = v.d.agreement?.status === "signed" ? v.d.agreement.body.clauses.find(([h]) => h === "Late payment")?.[1] ?? null : null;
  return buildNotice(v, profile, {
    date: sent ? istDate(sent) : todayIST(),
    account: decrypt(profile.bank_account_enc),
    lateInterestClause: late,
  });
}
