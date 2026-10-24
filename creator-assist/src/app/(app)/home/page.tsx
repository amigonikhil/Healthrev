import Link from "next/link";
import { trySampleData } from "@/app/actions/sample";
import { SubmitButton } from "@/components/client";
import { Item } from "@/components/ui";
import { addDays, fmtWeekday } from "@/lib/dates";
import { attentionRow, brandLabel, rowHref, type DealView } from "@/lib/deal-view";
import { loadViews } from "@/lib/data";
import { inr } from "@/lib/money";

export const metadata = { title: "Home · Creator Assist" };

const ORDER = { overdue: 0, due: 1, sign: 2, ready: 3, draft: 4, paid: 5 } as const;

export default async function Home() {
  const { profile, today, views } = await loadViews();
  const first = profile.name.split(/\s+/)[0];

  const open = views.filter((v) => v.phase === "overdue" || v.phase === "due");
  const owed = open.reduce((a, v) => a + v.remaining, 0);
  const overdue = views.filter((v) => v.phase === "overdue").reduce((a, v) => a + v.remaining, 0);
  const weekEnd = addDays(today, 6);
  const dueWeek = open.filter((v) => v.dueDate! >= today && v.dueDate! <= weekEnd).reduce((a, v) => a + v.remaining, 0);
  const tdsPending = open.reduce((a, v) => a + v.tdsRemaining, 0);

  const attention = views
    .filter((v) => v.phase !== "paid")
    .sort((a, b) => ORDER[a.phase] - ORDER[b.phase] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));

  return (
    <main className="scr">
      <div className="top" style={{ justifyContent: "space-between" }}>
        <div><p className="sub">{fmtWeekday(today)}</p><h1>Hi, {first}</h1></div>
        <Link className="btn" style={{ width: "auto" }} href="/deals/new">+ New deal</Link>
      </div>

      {views.length === 0 ? <Empty /> : (<>
        <div className="card" style={{ background: "var(--dark)", color: "var(--dark-text)", borderColor: "var(--dark)" }}>
          <p style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>Money owed to you</p>
          <p className="big">{inr(owed)}</p>
          <p style={{ fontSize: 13, opacity: 0.8 }}>
            {open.length} open invoice{open.length === 1 ? "" : "s"}{overdue ? ` · ${inr(overdue)} overdue` : ""}
          </p>
        </div>
        <div className="stats">
          <div className="stat"><span className="k">Due this week</span><span className="v">{inr(dueWeek)}</span></div>
          <div className="stat"><span className="k">TDS to be deducted</span><span className="v">{inr(tdsPending)}</span></div>
        </div>
        <h2>Needs attention</h2>
        {attention.length === 0 && <p className="sub">Nothing pending. Nice work!</p>}
        {attention.map((v) => <AttentionItem key={v.d.id} v={v} />)}
      </>)}
    </main>
  );
}

function AttentionItem({ v }: { v: DealView }) {
  const r = attentionRow(v);
  return <Item href={rowHref(v)} title={brandLabel(v.d)} sub={r.sub} amount={inr(r.amount)} chip={{ label: r.chip, tone: r.tone }} />;
}

function Empty() {
  return (
    <div className="card empty">
      <h2>No deals yet</h2>
      <p className="sub">Add a paid collab to send an agreement, raise a GST invoice and get reminders going.</p>
      <Link className="btn" href="/deals/new">Add your first deal</Link>
      <form action={trySampleData}>
        <SubmitButton className="btn sec" pendingText="Loading sample data…">Try with sample data</SubmitButton>
      </form>
      <p className="sub">Sample deals are marked and can be cleared any time in Settings.</p>
    </div>
  );
}
