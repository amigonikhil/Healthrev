import "server-only";
import { decrypt, hmac, safeEqual } from "./crypto";
import { istDate, todayIST } from "./dates";
import type { DealView } from "./deal-view";
import { buildNotice } from "./notice";
import type { Profile } from "./types";

/** The notice for a deal, dated when it was last sent (or today, for the preview). */
export function noticeFor(v: DealView, profile: Profile, opts: { fresh?: boolean } = {}) {
  const sent = v.d.escalations.filter((e) => e.type === "lawyer_notice").map((e) => e.created_at).sort().at(-1);
  const late = v.d.agreement?.status === "signed" ? v.d.agreement.body.clauses.find(([h]) => h === "Late payment")?.[1] ?? null : null;
  return buildNotice(v, profile, {
    date: sent && !opts.fresh ? istDate(sent) : todayIST(),
    account: decrypt(profile.bank_account_enc),
    lateInterestClause: late,
  });
}

/** Public link to the notice PDF, for the brand (shared on WhatsApp). */
export const noticeToken = (dealId: string) => `${dealId}.${hmac("notice:" + dealId)}`;
export function dealFromNoticeToken(token: string): string | null {
  const [id, sig] = token.split(".");
  return id && sig && safeEqual(sig, hmac("notice:" + id)) ? id : null;
}
