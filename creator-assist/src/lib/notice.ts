import { fmtDateLong, istDate } from "./dates";
import type { DealView } from "./deal-view";
import { inr } from "./money";
import type { Profile } from "./types";

const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Draft demand notice. Never sent automatically: it goes to a review queue. */
export function noticeDraft(v: DealView, p: Profile): string {
  const d = v.d;
  const inv = d.invoice!;
  const brand = d.brand.legal_name || d.brand.name;
  const signed = d.agreement?.signed_at ? ` under an agreement signed on ${fmtDateLong(istDate(d.agreement.signed_at))}` : "";
  const adv = inv.advance_deducted_paise ? `An advance of ${inr(inv.advance_deducted_paise)} was received; despite` : "Despite";
  const n = v.remindersSent;
  const reminders = n ? `${NUM[n] ?? n} reminder${n === 1 ? "" : "s"}` : "repeated requests";
  const paid = v.received + v.tdsRecorded > 0 ? ` after part-payments of ${inr(v.received + v.tdsRecorded)}` : "";
  const interest = p.udyam_no
    ? ` together with interest under Section 16 of the MSMED Act, 2006`
    : "";
  return `To ${brand}. Our client ${p.name} raised invoice ${inv.number} dated ${fmtDateLong(inv.invoice_date)} for ${inr(inv.total_paise)}, payable by ${fmtDateLong(inv.due_date)}${signed}. ${adv} ${reminders}, the balance of ${inr(v.remaining)}${paid} remains unpaid. You are called upon to pay ${inr(v.remaining)}${interest}, within 15 days of this notice.`;
}
