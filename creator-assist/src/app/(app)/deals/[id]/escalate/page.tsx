import Link from "next/link";
import { Chip, Top } from "@/components/ui";
import { msmeAnnualRate } from "@/lib/calc";
import { loadDealView } from "@/lib/data";
import { inr } from "@/lib/money";
import { SamadhaanItem } from "./samadhaan";

export default async function EscalatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile, tax } = await loadDealView(id);
  const d = v.d;
  const rate = msmeAnnualRate(tax);
  const canEscalate = v.phase === "overdue";

  return (
    <main className="scr">
      <Top title="Escalate" fallback={`/deals/${d.id}`} />
      {!canEscalate ? (
        <div className="info">
          {v.phase === "paid" ? "This deal is paid. Nothing to escalate." : "Escalation opens once the invoice is past its due date. Until then, friendly reminders work best."}
        </div>
      ) : (<>
        <div className="card">
          <p className="sub">MSME interest estimate · {d.brand.name}</p>
          <p className="big">{profile.udyam_no ? inr(v.interest) : "—"}</p>
          <p className="sub">
            {profile.udyam_no
              ? `${inr(v.remaining)} unpaid × ${rate.toFixed(1)}% a year (${tax.msme_multiple} × RBI bank rate) for ${v.daysOverdue} days, compounded monthly. Rate is editable in Settings; confirm with a CA.`
              : "Add your Udyam (MSME) number in Settings to claim interest on late payments under the MSMED Act."}
          </p>
        </div>
        <h2>Choose next step</h2>
        <Link className="item" href={`/deals/${d.id}/reminders`}>
          <span className="l"><span className="t">1 · Final reminder</span><span className="s">Firm message quoting MSME interest</span></span>
          <Chip tone="mute">Free</Chip>
        </Link>
        <Link className="item" href={`/deals/${d.id}/notice`}>
          <span className="l"><span className="t">2 · Lawyer notice</span><span className="s">An independent lawyer reviews and sends</span></span>
          <Chip tone="info">₹1,499</Chip>
        </Link>
        {profile.udyam_no && <SamadhaanItem dealId={d.id} />}
        <div className="info">Nothing is sent to the brand without your approval.</div>
      </>)}
    </main>
  );
}
