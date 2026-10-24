import Link from "next/link";
import { Row, Top } from "@/components/ui";
import { fmtDay, todayIST } from "@/lib/dates";
import { loadDealView } from "@/lib/data";
import { inr } from "@/lib/money";
import { PaymentForm } from "./form";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v } = await loadDealView(id);
  const d = v.d;
  const inv = d.invoice;

  return (
    <main className="scr">
      <Top title="Record payment" fallback={`/deals/${d.id}`} />
      {!inv ? (<>
        <div className="info">Generate the invoice first, then record payments against it.</div>
        <Link className="btn" href={`/deals/${d.id}/invoice`}>Open invoice</Link>
      </>) : (<>
        <p className="sub">
          {d.brand.name} · invoice {inr(inv.total_paise)}
          {inv.advance_deducted_paise ? ` · advance ${inr(inv.advance_deducted_paise)} already received` : ""}
        </p>
        {inv.payments.length > 0 && (
          <div className="card">
            <h2>Received</h2>
            {inv.payments.map((p) => (
              <Row key={p.id} k={`${fmtDay(p.received_on)}${p.utr ? ` · ${p.utr}` : ""}`} v={`${inr(p.amount_paise)}${p.tds_paise ? ` + ${inr(p.tds_paise)} TDS` : ""}`} />
            ))}
          </div>
        )}
        {v.phase === "paid" ? (
          <div className="info">This invoice is fully settled.</div>
        ) : (
          <PaymentForm
            dealId={d.id} total={inv.total_paise} advance={inv.advance_deducted_paise} paidBefore={v.received + v.tdsRecorded}
            balance={inv.balance_due_paise} suggestAmount={v.receive} suggestTds={v.tdsRemaining} today={todayIST()}
          />
        )}
      </>)}
    </main>
  );
}
