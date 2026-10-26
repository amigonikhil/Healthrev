import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { filtersOf, loadPeople, loadQueues, QUEUE_STATUSES, QUEUE_TABS, waitingLabel, type QueueItem, type QueueKind } from "@/lib/admin/data";
import { inRange, one, parseRange, qs, type SP } from "@/lib/admin/range";
import { daysBetween, fmtDate, istDate, todayIST } from "@/lib/dates";
import { inr } from "@/lib/money";
import { fmtSlot } from "@/lib/slots";
import { Chip } from "@/components/ui";
import { QueueControls, RangePicker } from "../controls";

const FILING = { gstr1: "GSTR-1", gstr3b: "GSTR-3B", advance_tax: "Advance tax", itr: "ITR" } as Record<string, string>;
const TONE = { new: "info", in_review: "mute", done: "ok", rejected: "over" } as const;

export default async function Queues({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const r = parseRange(sp);
  const f = filtersOf(sp);
  const tab = (QUEUE_TABS.find((t) => t.kind === one(sp.tab))?.kind ?? "lawyer_notice") as QueueKind;
  const status = one(sp.status);
  const [all, people] = await Promise.all([loadQueues(db, f), loadPeople(db, { ...f, admins: true })]);
  const name = new Map(people.map((p) => [p.id, p.name ?? "Not onboarded"]));
  const inTab = all.filter((q) => q.kind === tab && (r.key === "all" || inRange(q.created_at, r)));
  const rows = inTab.filter((q) => !status || q.status === status);
  if (tab === "filing") rows.sort((a, b) => String(a.fields.due_date).localeCompare(String(b.fields.due_date)));
  else rows.sort((a, b) => a.created_at.localeCompare(b.created_at)); // longest waiting first
  const today = todayIST();
  const creator = (q: QueueItem) => <Link href={`/admin/creators/${q.user_id}${qs(sp)}`}>{name.get(q.user_id) ?? "Deleted account"}</Link>;

  const cols: Record<QueueKind, string[]> = {
    lawyer_notice: ["Creator", "Brand", "Amount", "Days overdue", "Created", "Waiting", "Status"],
    ai_call: ["Creator", "Slot", "Language", "Consent", "Created", "Waiting", "Status"],
    filing: ["Creator", "Filing", "Period", "Due date", "Handled by", "Data sent", "Status"],
    ais_upload: ["Creator", "FY", "Uploaded", "Parsed", "Mismatches", "Waiting", "Status"],
    legal_call: ["Creator", "Deal", "Slot", "Created", "Waiting", "Status"],
  };
  const cells = (q: QueueItem): React.ReactNode[] => {
    const v = q.fields;
    switch (q.kind) {
      case "lawyer_notice": return [creator(q), v.brand, inr(Number(v.amount)), `${v.days_overdue} days`, fmtDate(istDate(q.created_at)), waitingLabel(q.created_at)];
      case "ai_call": return [creator(q), fmtSlot(String(v.slot)), v.language, v.consent ? "Yes" : "No", fmtDate(istDate(q.created_at)), waitingLabel(q.created_at)];
      case "filing": { const d = daysBetween(today, String(v.due_date)); return [creator(q), FILING[String(v.type)] ?? v.type, v.period, <span key="d" className={d <= 7 ? "ad-warn" : ""}>{fmtDate(String(v.due_date))}{d < 0 ? ` · ${-d}d late` : d <= 7 ? ` · in ${d}d` : ""}</span>, v.handled_by === "creator_assist" ? "Creator Assist" : "Own CA", v.data_sent_at ? fmtDate(istDate(String(v.data_sent_at))) : "Not yet"]; }
      case "ais_upload": return [creator(q), v.fy, fmtDate(istDate(q.created_at)), v.parsed ? "Yes" : "No", v.parsed ? v.mismatches : "—", waitingLabel(q.created_at)];
      case "legal_call": return [creator(q), v.brand, fmtSlot(String(v.slot)), fmtDate(istDate(q.created_at)), waitingLabel(q.created_at)];
    }
  };
  const count = (k: QueueKind) => all.filter((q) => q.kind === k && q.status === "new").length;

  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Queues <small>requests that need a human</small></h1><RangePicker /></header>
      <nav className="chips" aria-label="Queues">
        {QUEUE_TABS.map((t) => <Link key={t.kind} href={`/admin/queues${qs(sp, { tab: t.kind, status: null })}`} className={tab === t.kind ? "on" : ""}>{t.label}{count(t.kind) > 0 && <b className="ad-badge">{count(t.kind)}</b>}</Link>)}
      </nav>
      <nav className="chips" aria-label="Status">
        <Link href={`/admin/queues${qs(sp, { tab, status: null })}`} className={!status ? "on" : ""}>All · {inTab.length}</Link>
        {QUEUE_STATUSES.map((s) => <Link key={s} href={`/admin/queues${qs(sp, { tab, status: s })}`} className={status === s ? "on" : ""}>{s.replace("_", " ")} · {inTab.filter((q) => q.status === s).length}</Link>)}
      </nav>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr>{cols[tab].map((c) => <th key={c}>{c}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id} className={tab === "filing" && daysBetween(today, String(q.fields.due_date)) <= 7 && q.status !== "done" ? "ad-hl" : ""}>
                {cells(q).map((c, i) => <td key={i}>{c}</td>)}
                <td><Chip tone={TONE[q.status]}>{q.status.replace("_", " ")}</Chip>{q.sample && <small className="sub"> sample</small>}</td>
                <td>
                  <details className="ad-update">
                    <summary>Update</summary>
                    {q.kind === "lawyer_notice" && q.fields.draft && <details className="ad-draft"><summary>Draft preview (contact and bank details hidden)</summary><pre>{String(q.fields.draft)}</pre></details>}
                    {q.kind === "legal_call" && q.fields.note && <p className="sub">Creator&apos;s note: {String(q.fields.note)}</p>}
                    {q.note && <p className="sub">Note: {q.note}</p>}
                    <QueueControls kind={q.kind} id={q.id} status={q.status} note={q.note} />
                  </details>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={cols[tab].length + 2} className="sub">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="sub">Changing a status sends the creator an in-app notice. Internal notes are only visible to admins.</p>
    </main>
  );
}
