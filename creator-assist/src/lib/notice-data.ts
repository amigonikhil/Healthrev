import "server-only";
import { parseLateClause, type TaxConfig } from "./calc";
import { decrypt, hmac, safeEqual } from "./crypto";
import { istDate, todayIST } from "./dates";
import type { DealView } from "./deal-view";
import { buildNotice } from "./notice";
import type { Profile } from "./types";

/** The notice for a deal, dated when it was last sent (or today, for the preview). */
export function noticeFor(v: DealView, profile: Profile, tax: TaxConfig, opts: { fresh?: boolean } = {}) {
  const sent = v.d.escalations.filter((e) => e.type === "lawyer_notice").map((e) => e.created_at).sort().at(-1);
  // Interest is claimed at the rate the brand signed up to (clause titles are numbered, e.g. "4. Late payment").
  const clause = v.d.agreement?.status === "signed" ? v.d.agreement.body.clauses.find(([h]) => /Late payment$/.test(h))?.[1] ?? null : null;
  const late = parseLateClause(clause);
  return buildNotice(v, profile, {
    date: sent && !opts.fresh ? istDate(sent) : todayIST(),
    account: decrypt(profile.bank_account_enc),
    lateClause: late ? clause!.split(/(?<=\.) (?=Creator is registered)/)[0] : null,
    late,
    legalFeePaise: tax.notice_legal_fee_paise,
  });
}

/** Public link to the notice PDF, for the brand (shared on WhatsApp). */
export const noticeToken = (dealId: string) => `${dealId}.${hmac("notice:" + dealId)}`;
export function dealFromNoticeToken(token: string): string | null {
  const [id, sig] = token.split(".");
  return id && sig && safeEqual(sig, hmac("notice:" + id)) ? id : null;
}
