import Link from "next/link";
import { Head, Item } from "@/components/ui";
import { rowHref } from "@creator-assist/shared/deal-view";
import { webCtx } from "@/server/context";
import { brands } from "@/server/deals";

export const metadata = { title: "Brands · Creator Assist" };

export default async function Brands() {
  const { rows } = await brands(await webCtx());

  return (
    <main className="scr">
      <Head title="Brands" />
      {rows.length === 0 && (
        <div className="card empty">
          <p className="sub">Brands appear here once you add a deal.</p>
          <Link className="btn" href="/deals/new">Add a deal</Link>
        </div>
      )}
      {rows.map((r) => (
        <Item key={r.brand.id} avatar={r.brand.name} href={rowHref(r.open)} title={r.brand.name} sub={r.sub} amount={r.amount} chip={{ label: r.chip, tone: r.tone }} />
      ))}
    </main>
  );
}
