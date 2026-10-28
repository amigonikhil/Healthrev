import Link from "next/link";
import { Head, Item } from "@/components/ui";
import { daysBetween } from "@/lib/dates";
import { rowHref, sumAmounts, type DealView, type Tone } from "@/lib/deal-view";
import { loadViews } from "@/lib/data";

export const metadata = { title: "Brands · Creator Assist" };

function behaviour(vs: DealView[], today: string): { sub: string; chip: string; tone: Tone } {
  const b = vs[0].d.brand;
  const who = b.agency_name ? `via ${b.agency_name} · ${b.contact_name ?? ""}` : b.contact_name ?? b.city ?? "";
  const paid = vs.filter((v) => v.phase === "paid" && v.paidOn && v.d.invoice);
  const overdue = vs.filter((v) => v.phase === "overdue");
  if (overdue.length) {
    const days = Math.max(...overdue.map((v) => daysBetween(v.d.invoice!.invoice_date, today)));
    return { sub: `${b.contact_name ?? ""} · pays in ~${days} days`, chip: "Slow payer", tone: "over" };
  }
  if (paid.length) {
    const avg = Math.round(paid.reduce((a, v) => a + daysBetween(v.d.invoice!.invoice_date, v.paidOn!), 0) / paid.length);
    const late = paid.some((v) => v.paidOn! > v.d.invoice!.due_date);
    return { sub: `${b.contact_name ?? ""} · paid in ${avg} days`, chip: late ? "Paid late" : "On time", tone: late ? "info" : "ok" };
  }
  if (vs.some((v) => v.phase === "sign")) return { sub: `${b.contact_name ?? ""} · agreement pending`, chip: "To sign", tone: "info" };
  return { sub: who || (b.city ?? ""), chip: "New", tone: "mute" };
}

export default async function Brands() {
  const { views, today } = await loadViews();
  const groups = new Map<string, DealView[]>();
  for (const v of views) groups.set(v.d.brand.id, [...(groups.get(v.d.brand.id) ?? []), v]);

  return (
    <main className="scr">
      <Head title="Brands" />
      {groups.size === 0 && (
        <div className="card empty">
          <p className="sub">Brands appear here once you add a deal.</p>
          <Link className="btn" href="/deals/new">Add a deal</Link>
        </div>
      )}
      {[...groups.values()].map((vs) => {
        const r = behaviour(vs, today);
        const unpaid = vs.filter((v) => v.phase !== "paid");
        const open = unpaid[0] ?? vs[0];
        // Brands you're still owed by show what's due; fully paid brands show what they paid.
        const amount = unpaid.length ? { ...sumAmounts(unpaid), label: "due" as const } : { ...sumAmounts(vs), label: "paid" as const };
        return <Item key={vs[0].d.brand.id} avatar={vs[0].d.brand.name} href={rowHref(open)} title={vs[0].d.brand.name} sub={r.sub} amount={amount} chip={{ label: r.chip, tone: r.tone }} />;
      })}
    </main>
  );
}
