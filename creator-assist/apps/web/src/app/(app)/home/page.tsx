import Link from "next/link";
import { trySampleData } from "@/app/actions/sample";
import { SubmitButton } from "@/components/client";
import { Help } from "@/components/help";
import { NewDealButton } from "@/components/new-deal";
import { Head, Item } from "@/components/ui";
import { fmtWeekday } from "@creator-assist/shared/dates";
import { attentionRow, brandLabel, dealAmounts, rowHref, type DealView } from "@creator-assist/shared/deal-view";
import { webCtx } from "@/server/context";
import { home } from "@/server/deals";
import { inr } from "@creator-assist/shared/money";

export const metadata = { title: "Home · Creator Assist" };

export default async function Home() {
  const ctx = await webCtx();
  const first = ctx.profile.name.split(/\s+/)[0];
  const { today, empty, owed, openCount, overdue, dueThisWeek: dueWeek, tdsPending, attention } = await home(ctx);

  return (
    <main className="scr">
      <Head eyebrow={fmtWeekday(today)} title={`Hi, ${first}`}>
        <NewDealButton />
      </Head>

      {empty ? <Empty /> : (<>
        <section className="hero-y">
          <p className="k">Money owed to you</p>
          <p className="hero-amt">{inr(owed.due)} <span className="hero-l">due</span></p>
          <p className="hero-sub">{inr(owed.afterTds)} after TDS</p>
          <p className="stickers">
            <span className="sticker dark">{openCount} open invoice{openCount === 1 ? "" : "s"}</span>
            {overdue ? <><span className="sr"> · </span><span className="sticker pop over">{inr(overdue)} overdue</span></> : null}
          </p>
        </section>
        <div className="stats">
          <div className="stat"><span className="k">Due this week</span><span className="v">{inr(dueWeek)}</span></div>
          <div className="stat"><span className="k">TDS to be deducted<Help term="tds" /></span><span className="v">{inr(tdsPending)}</span></div>
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
  return <Item avatar={v.d.brand.name} href={rowHref(v)} title={brandLabel(v.d)} sub={r.sub} amount={dealAmounts(v)} chip={{ label: r.chip, tone: r.tone }} />;
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
