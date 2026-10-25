import { dealSummary, msmeInterest, tdsEstimate, type TaxConfig } from "./calc";
import { daysBetween, fmtDay, istDate } from "./dates";
import { deliverablesSummary } from "./deliverables";
import { inr } from "./money";
import type { DealFull, Profile } from "./types";

export type Tone = "over" | "info" | "ok" | "mute";
export type Phase = "paid" | "overdue" | "due" | "sign" | "ready" | "draft";

export type DealView = {
  d: DealFull;
  phase: Phase;
  /** Remaining unpaid balance including the share the brand will deduct as TDS. */
  remaining: number;
  tdsExpected: number;
  tdsRecorded: number;
  tdsRemaining: number;
  /** What the creator should still see land in the bank. */
  receive: number;
  received: number;
  total: number;
  dueDate: string | null;
  daysToDue: number | null;
  daysOverdue: number;
  interest: number;
  remindersSent: number;
  paidOn: string | null;
};

export function viewDeal(d: DealFull, profile: Profile, tax: TaxConfig, today: string): DealView {
  const inv = d.invoice;
  const payments = inv?.payments ?? [];
  const received = payments.reduce((a, p) => a + p.amount_paise, 0);
  const tdsRecorded = payments.reduce((a, p) => a + p.tds_paise, 0);
  const remindersSent = d.reminders.filter((r) => r.kind === "payment" && r.sent_at).length;

  let total: number, remaining: number, tdsExpected: number;
  if (inv) {
    total = inv.total_paise;
    remaining = inv.balance_due_paise - received - tdsRecorded;
    tdsExpected = tdsEstimate(inv.taxable_paise, Number(inv.tds_rate));
  } else {
    const s = dealSummary({
      feePaise: d.fee_paise,
      gstMode: d.gst_mode,
      tdsRate: Number(d.tds_rate),
      advancePaise: d.advance_received_at ? d.advance_paise : 0,
      creatorStateCode: profile.state_code,
      brandStateCode: d.brand.state_code,
      creatorRegistered: !!profile.gstin,
      tax,
    });
    total = s.total;
    remaining = s.balanceDue;
    tdsExpected = s.tds;
  }
  const tdsRemaining = Math.max(0, Math.min(tdsExpected - tdsRecorded, remaining));
  const dueDate = inv?.due_date ?? null;
  const daysToDue = dueDate ? daysBetween(today, dueDate) : null;
  const daysOverdue = daysToDue != null && daysToDue < 0 ? -daysToDue : 0;

  let phase: Phase;
  if (d.status === "paid" || (inv && remaining <= 0)) phase = "paid";
  else if (inv && daysOverdue > 0) phase = "overdue";
  else if (inv) phase = "due";
  else if (d.agreement?.status === "sent") phase = "sign";
  else if (d.status === "draft") phase = "draft";
  else phase = "ready";

  const paidOn = phase === "paid" && payments.length ? payments.map((p) => p.received_on).sort().at(-1)! : null;
  const interest = phase === "overdue" && profile.udyam_no ? msmeInterest(remaining, daysOverdue, tax) : 0;

  return {
    d, phase, remaining: Math.max(0, remaining), tdsExpected, tdsRecorded, tdsRemaining,
    receive: Math.max(0, remaining - tdsRemaining), received, total, dueDate, daysToDue, daysOverdue,
    interest, remindersSent, paidOn,
  };
}

export const brandLabel = (d: DealFull) => d.brand.name;
export const brandWithAgency = (d: DealFull) =>
  d.paid_by === "agency" && d.brand.agency_name ? `${d.brand.name} via ${d.brand.agency_name}` : d.brand.name;

/** Where a row on Home / Deals opens, mirroring the prototype's flow. */
export function rowHref(v: DealView): string {
  const id = v.d.id;
  switch (v.phase) {
    case "overdue": return `/deals/${id}`;
    case "due": return v.daysToDue === 0 ? `/deals/${id}/reminders` : `/deals/${id}/invoice`;
    case "sign": return `/deals/${id}/agreement`;
    default: return `/deals/${id}`;
  }
}

/** Home "Needs attention" row. */
export function attentionRow(v: DealView): { sub: string; amount: number; chip: string; tone: Tone } {
  const d = v.d;
  const due = v.dueDate ? fmtDay(v.dueDate) : "";
  const advance = d.advance_received_at && d.advance_paise ? d.advance_paise : 0;
  switch (v.phase) {
    case "overdue":
      return {
        sub: advance ? `Balance after ${inr(advance)} advance · due ${due}` : `${d.invoice!.number} · due ${due}`,
        amount: v.remaining, chip: `Overdue ${v.daysOverdue} day${v.daysOverdue === 1 ? "" : "s"}`, tone: "over",
      };
    case "due": {
      const when = v.daysToDue === 0 ? "due today" : `due ${due}`;
      const sub = d.paid_by === "agency" && d.brand.agency_name
        ? `via ${d.brand.agency_name} · ${when}`
        : `${deliverablesSummary(d.deliverables, " + ")} · ${when}`;
      const sentToday = d.reminders.some((r) => r.kind === "payment" && r.sent_at);
      const chip = d.status === "partially_paid" ? "Part paid"
        : v.daysToDue === 0 ? (sentToday ? "Reminder sent" : "Due today")
        : `Due in ${v.daysToDue} day${v.daysToDue === 1 ? "" : "s"}`;
      return { sub, amount: v.remaining, chip, tone: v.daysToDue === 0 || d.status === "partially_paid" ? "info" : "mute" };
    }
    case "sign":
      return { sub: `Agreement sent ${fmtDay(istDate(d.agreement!.sent_at))}`, amount: d.fee_paise, chip: "Awaiting sign", tone: "info" };
    case "ready":
      return { sub: `${deliverablesSummary(d.deliverables, " + ")} · not invoiced`, amount: d.fee_paise, chip: "Ready to invoice", tone: "mute" };
    case "draft":
      return { sub: "Agreement not sent", amount: d.fee_paise, chip: "Draft", tone: "mute" };
    default:
      return { sub: "", amount: v.total, chip: "Paid", tone: "ok" };
  }
}

/** Deals list row. */
export function listRow(v: DealView): { sub: string; amount: number; chip: string; tone: Tone; key: string } {
  const d = v.d;
  const n = d.invoice?.number;
  const due = v.dueDate ? fmtDay(v.dueDate) : "";
  switch (v.phase) {
    case "overdue": return { sub: `${n} · balance due ${due}`, amount: v.remaining, chip: "Overdue", tone: "over", key: "over" };
    case "due": return {
      sub: `${n} · due ${due}`, amount: v.remaining,
      chip: d.status === "partially_paid" ? "Part paid" : v.daysToDue === 0 ? "Due today" : `In ${v.daysToDue} day${v.daysToDue === 1 ? "" : "s"}`,
      tone: v.daysToDue === 0 ? "info" : "mute", key: "due",
    };
    case "sign": return { sub: "Not invoiced yet", amount: d.fee_paise, chip: "To sign", tone: "info", key: "sign" };
    case "paid": return { sub: `${n ?? ""} · paid ${v.paidOn ? fmtDay(v.paidOn) : ""}`, amount: v.total, chip: "Paid", tone: "ok", key: "paid" };
    case "ready": return { sub: "Not invoiced yet", amount: d.fee_paise, chip: "Signed", tone: "ok", key: "other" };
    default: return { sub: "Agreement not sent", amount: d.fee_paise, chip: "Draft", tone: "mute", key: "other" };
  }
}

/** Status chip at the top of the deal detail screen. */
export function detailChip(v: DealView): { label: string; tone: Tone } {
  const esc = v.d.escalations.some((e) => e.type === "lawyer_notice");
  switch (v.phase) {
    case "overdue": return { label: `Balance overdue ${v.daysOverdue} day${v.daysOverdue === 1 ? "" : "s"}${esc ? " · escalated" : ""}`, tone: "over" };
    case "due": return { label: v.d.status === "partially_paid" ? "Partly paid" : v.daysToDue === 0 ? "Due today" : `Due in ${v.daysToDue} days`, tone: v.daysToDue === 0 ? "info" : "mute" };
    case "sign": return { label: "Agreement awaiting signature", tone: "info" };
    case "ready": return { label: "Agreement signed · not invoiced", tone: "ok" };
    case "draft": return { label: "Draft · agreement not sent", tone: "mute" };
    default: return { label: "Paid", tone: "ok" };
  }
}
