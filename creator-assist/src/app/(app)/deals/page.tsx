import Link from "next/link";
import { Item } from "@/components/ui";
import { brandWithAgency, listRow, rowHref } from "@/lib/deal-view";
import { loadViews } from "@/lib/data";
import { inr } from "@/lib/money";

export const metadata = { title: "Deals · Creator Assist" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "over", label: "Overdue" },
  { key: "due", label: "Awaiting pay" },
  { key: "sign", label: "To sign" },
  { key: "paid", label: "Paid" },
] as const;

export default async function Deals({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "all" } = await searchParams;
  const { views } = await loadViews();
  const rows = views.map((v) => ({ v, r: listRow(v) }));
  const count = (k: string) => (k === "all" ? rows.length : rows.filter((x) => x.r.key === k).length);
  const shown = f === "all" ? rows : rows.filter((x) => x.r.key === f);

  return (
    <main className="scr">
      <div className="top" style={{ justifyContent: "space-between" }}>
        <h1>Deals</h1>
        <Link className="btn" style={{ width: "auto" }} href="/deals/new">+ New</Link>
      </div>
      <nav className="chips" aria-label="Filter deals">
        {FILTERS.map((x) => (
          <Link key={x.key} href={x.key === "all" ? "/deals" : `/deals?f=${x.key}`} className={f === x.key ? "on" : ""} aria-current={f === x.key ? "true" : undefined} replace scroll={false}>
            {x.label} · {count(x.key)}
          </Link>
        ))}
      </nav>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map(({ v, r }) => (
          <Item key={v.d.id} avatar={v.d.brand.name} href={rowHref(v)} title={brandWithAgency(v.d)} sub={r.sub} amount={inr(r.amount)} chip={{ label: r.chip, tone: r.tone }} />
        ))}
        {shown.length === 0 && (
          <div className="card empty">
            <p className="sub">{rows.length ? "No deals in this view." : "No deals yet."}</p>
            {!rows.length && <Link className="btn" href="/deals/new">Add your first deal</Link>}
          </div>
        )}
      </div>
    </main>
  );
}
