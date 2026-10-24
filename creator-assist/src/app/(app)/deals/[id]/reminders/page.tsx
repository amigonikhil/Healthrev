import { Chip, Top } from "@/components/ui";
import { fmtDay, istDate } from "@/lib/dates";
import { loadDealView } from "@/lib/data";
import { STAGE_LABEL } from "@/lib/messages";
import { inr } from "@/lib/money";
import { Composer } from "./composer";

export default async function RemindersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile } = await loadDealView(id);
  const d = v.d;
  const inv = d.invoice;
  const ladder = d.reminders.filter((r) => r.kind === "payment" && r.channel === "email").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const manual = d.reminders.filter((r) => r.kind === "payment" && r.channel === "whatsapp");

  // Current stage: the latest ladder step that has come due (or the first one).
  const due = ladder.filter((r) => r.scheduled_at <= new Date().toISOString());
  const stage = (due.at(-1) ?? ladder[0])?.stage ?? "friendly";
  const status = v.phase === "overdue" ? `${inr(v.remaining)} balance overdue` : v.phase === "paid" ? "Paid in full" : inv ? `${inr(v.remaining)} due ${fmtDay(inv.due_date)}` : "Not invoiced yet";

  return (
    <main className="scr">
      <Top title="Reminders" fallback={`/deals/${d.id}`} />
      <p className="sub">{d.brand.name} · {status}</p>
      {!inv ? (
        <div className="info">Reminders start once the invoice is generated. They go out at 0, 7, 15 and 30 days after the due date (change this in Settings).</div>
      ) : (<>
        <div className="card">
          <h2>Ladder</h2>
          {ladder.map((r) => {
            const [label, tone] = r.cancelled_at ? ["Cancelled", "mute"] : r.sent_at ? [r.read_at ? "Sent · read" : "Sent", "ok"] : ["Scheduled", "mute"];
            return (
              <div className="row" key={r.id}>
                <span>{STAGE_LABEL[r.stage] ?? r.stage} · {fmtDay(istDate(r.scheduled_at))}</span>
                <Chip tone={tone as "ok" | "mute"}>{label}</Chip>
              </div>
            );
          })}
          {manual.length > 0 && <p className="sub">{manual.length} sent by you on WhatsApp</p>}
        </div>
        {v.phase !== "paid" && (
          <Composer
            dealId={d.id} stage={stage} defaultLang={profile.language}
            contact={d.brand.contact_name ?? ""} phone={d.brand.contact_whatsapp} email={d.brand.contact_email}
            ccEmail={d.brand.cc_email} invoiceNo={inv.number} balance={v.remaining} dueDate={inv.due_date}
            daysToDue={v.daysToDue ?? 0} msmeAvailable={!!profile.udyam_no} creator={profile.name}
          />
        )}
      </>)}
    </main>
  );
}
