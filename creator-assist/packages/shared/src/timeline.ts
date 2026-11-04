import { fmtDay, istDate } from "./dates";
import type { DealView } from "./deal-view";
import { STAGE_LABEL } from "./messages";
import { inr } from "./money";

export type TimelineItem = { color: string; text: string; date: string };
// Dot colours are design tokens (see globals.css).
const GREEN = "var(--dot-ok)", AMBER = "var(--dot-warn)", BLUE = "var(--dot-info)", GREY = "var(--dot-mute)";

export function dealTimeline(v: DealView, today: string): TimelineItem[] {
  const d = v.d;
  const out: TimelineItem[] = [];
  const a = d.agreement;
  if (a) {
    if (a.status === "signed" && a.signed_at) out.push({ color: GREEN, text: `Agreement signed · ${fmtDay(istDate(a.signed_at))}`, date: a.signed_at });
    else out.push({ color: BLUE, text: `Agreement sent for e-sign · ${fmtDay(istDate(a.sent_at))}`, date: a.sent_at });
  }
  if (d.advance_received_at && d.advance_paise) {
    out.push({ color: GREEN, text: `Advance ${inr(d.advance_paise)} received · ${fmtDay(d.advance_received_at)}`, date: d.advance_received_at + "T12:00" });
  }
  const inv = d.invoice;
  if (inv) {
    const live = d.go_live_date && d.go_live_date <= inv.invoice_date ? "Content live, invoice sent" : `Invoice ${inv.number} raised`;
    out.push({ color: GREEN, text: `${live} · ${fmtDay(inv.invoice_date)}`, date: inv.invoice_date + "T18:00" });
    for (const p of inv.payments) {
      out.push({ color: GREEN, text: `${inr(p.amount_paise)} received${p.tds_paise ? ` + ${inr(p.tds_paise)} TDS` : ""} · ${fmtDay(p.received_on)}`, date: p.received_on + "T12:00" });
    }
    if (v.phase === "overdue") out.push({ color: AMBER, text: `Balance due date passed · ${fmtDay(inv.due_date)}`, date: inv.due_date + "T09:00" });
  } else if (d.go_live_date) {
    out.push({ color: d.go_live_date <= today ? GREEN : GREY, text: `Go-live · ${fmtDay(d.go_live_date)}`, date: d.go_live_date + "T10:00" });
  }

  const pay = d.reminders.filter((r) => r.kind === "payment");
  const sent = pay.filter((r) => r.sent_at).sort((x, y) => x.sent_at!.localeCompare(y.sent_at!));
  if (sent.length) {
    const read = sent.every((r) => r.read_at);
    const first = fmtDay(istDate(sent[0].sent_at!)), last = fmtDay(istDate(sent.at(-1)!.sent_at!));
    out.push({
      color: BLUE,
      text: `${sent.length} reminder${sent.length > 1 ? "s" : ""} sent${read ? ", read by brand" : ""} · ${first === last ? first : `${first}–${last}`}`,
      date: sent.at(-1)!.sent_at!,
    });
  }
  for (const e of d.escalations) {
    const label = e.type === "lawyer_notice" ? (e.channel ? `Legal notice sent by ${e.channel === "email" ? "email" : "WhatsApp"}` : "Lawyer notice sent for review") : e.type === "msme_samadhaan" ? "MSME Samadhaan case started" : "Final reminder sent";
    out.push({ color: AMBER, text: `${label} · ${fmtDay(istDate(e.created_at))}`, date: e.created_at });
  }
  if (v.phase === "paid") {
    out.push({ color: GREEN, text: `Paid in full${v.paidOn ? ` · ${fmtDay(v.paidOn)}` : ""}`, date: (v.paidOn ?? today) + "T23:00" });
  } else {
    const next = pay.filter((r) => !r.sent_at && !r.cancelled_at).sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))[0];
    if (next) out.push({ color: GREY, text: `${STAGE_LABEL[next.stage] ?? "Reminder"} scheduled · ${fmtDay(istDate(next.scheduled_at))}`, date: next.scheduled_at });
    else if (v.noticeDueAt && !d.escalations.some((e) => e.type === "lawyer_notice" && e.status === "sent")) {
      out.push({ color: v.noticeReady ? AMBER : GREY, text: `${v.noticeReady ? "Legal notice due" : "Legal notice"} · ${fmtDay(istDate(v.noticeDueAt))}`, date: v.noticeDueAt });
    }
    else if (inv && v.phase === "due") out.push({ color: GREY, text: `Balance due · ${fmtDay(inv.due_date)}`, date: inv.due_date + "T09:00" });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
