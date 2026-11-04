import { Chip, Top } from "@/components/ui";
import Link from "next/link";
import { fmtDay, fmtTimeIST, istDate } from "@creator-assist/shared/dates";
import { STAGE_LABEL } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import { everyHours, REMINDER_COUNT } from "@creator-assist/shared/reminder-schedule";
import { webCtx } from "@/server/context";
import { orRedirect } from "@/server/forms";
import { reminderView } from "@/server/reminders";
import { Composer } from "./composer";

export default async function RemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await webCtx();
  const { profile } = ctx;
  const { v, ladder, manual, stage, templates } = await orRedirect(reminderView(ctx, id), "/deals");
  const d = v.d;
  const inv = d.invoice;
  const status = v.phase === "overdue" ? `${inr(v.remaining)} balance overdue` : v.phase === "paid" ? "Paid in full" : inv ? `${inr(v.remaining)} due ${fmtDay(inv.due_date)}` : "Not invoiced yet";

  return (
    <main className="scr">
      <Top title="Reminders" fallback={`/deals/${d.id}`} />
      <p className="sub">{d.brand.name} · {status}</p>
      {!inv ? (
        <div className="info">Reminders start once the invoice is generated: {REMINDER_COUNT} reminders every {everyHours(profile.remind_every_hours)} hours from the due date, then the legal notice (change this in Settings).</div>
      ) : (<>
        <div className="card">
          <h2>Ladder</h2>
          {ladder.map((r) => {
            const [label, tone] = r.cancelled_at ? ["Cancelled", "mute"] : r.sent_at ? [r.read_at ? "Sent · read" : "Sent", "ok"] : ["Scheduled", "mute"];
            return (
              <div className="row" key={r.id}>
                <span>{STAGE_LABEL[r.stage] ?? r.stage} · {fmtDay(istDate(r.scheduled_at))}, {fmtTimeIST(r.scheduled_at)}</span>
                <Chip tone={tone as "ok" | "mute"}>{label}</Chip>
              </div>
            );
          })}
          {v.noticeDueAt && v.phase !== "paid" && (
            <div className="row"><span>Legal notice · {fmtDay(istDate(v.noticeDueAt))}, {fmtTimeIST(v.noticeDueAt)}</span><Chip tone={v.noticeReady ? "over" : "mute"}>{v.noticeReady ? "Due now" : "Next"}</Chip></div>
          )}
          {manual.length > 0 && <p className="sub">{manual.length} sent by you on WhatsApp</p>}
        </div>
        {v.noticeReady && <Link className="btn" href={`/deals/${d.id}/notice`}>Send legal notice</Link>}
        {v.phase !== "paid" && (
          <Composer
            dealId={d.id} stage={stage} defaultLang={profile.language}
            contact={d.brand.contact_name ?? ""} phone={d.brand.contact_whatsapp} email={d.brand.contact_email}
            ccEmail={d.brand.cc_email} invoiceNo={inv.number} balance={v.remaining} dueDate={inv.due_date}
            daysToDue={v.daysToDue ?? 0} msmeAvailable={!!profile.udyam_no} creator={profile.name} templates={templates}
          />
        )}
      </>)}
    </main>
  );
}
