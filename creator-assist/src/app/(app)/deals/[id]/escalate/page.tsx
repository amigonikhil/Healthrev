import Link from "next/link";
import { Chip, Top } from "@/components/ui";
import { ADVOCATE, LEGAL_CALL, NOTICE_DAYS } from "@/lib/advocate";
import { msmeAnnualRate } from "@/lib/calc";
import { loadDealView } from "@/lib/data";
import { addDays, daysBetween, fmtDateLong, istDate } from "@/lib/dates";
import { inr } from "@/lib/money";
import { noticeFor } from "@/lib/notice-data";
import { fmtSlot } from "@/lib/slots";
import { SamadhaanItem } from "./samadhaan";

export default async function EscalatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile, tax, today, db } = await loadDealView(id);
  const d = v.d;
  const rate = msmeAnnualRate(tax);
  const canEscalate = v.phase === "overdue";
  const sent = d.escalations.filter((e) => e.type === "lawyer_notice" && e.status === "sent").sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1);
  if (canEscalate && sent) {
    const { data: call } = await db.from("legal_call_bookings").select("slot").eq("deal_id", d.id).neq("status", "cancelled").order("slot", { ascending: false }).limit(1).maybeSingle();
    return <AfterNotice id={d.id} brand={d.brand.name} sentOn={istDate(sent.created_at)} channel={sent.channel} today={today}
      claim={noticeFor(v, profile, tax).claim} callSlot={call?.slot ?? null} udyam={!!profile.udyam_no} />;
  }

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
          <span className="l"><span className="t">1 · Send final reminder</span><span className="s">Firm message quoting MSME interest</span></span>
          <span aria-hidden="true">›</span>
        </Link>
        <Link className="item" href={`/deals/${d.id}/notice`}>
          <span className="l"><span className="t">2 · Send legal notice</span><span className="s">On {ADVOCATE.firm} letterhead, by WhatsApp or email</span></span>
          <span aria-hidden="true">›</span>
        </Link>
        {profile.udyam_no && <SamadhaanItem dealId={d.id} />}
        <div className="info">Nothing goes to the brand until you press send.</div>
      </>)}
    </main>
  );
}

/** After the legal notice: the notice period countdown, then the legal team call. */
function AfterNotice(p: {
  id: string; brand: string; sentOn: string; channel: "email" | "whatsapp" | null; today: string;
  claim: { principal: number; interest: number; legalFee: number; total: number }; callSlot: string | null; udyam: boolean;
}) {
  const deadline = addDays(p.sentOn, NOTICE_DAYS);
  const left = daysBetween(p.today, deadline);
  const period = left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : left === 0 ? "Ends today" : `Ended ${-left} day${left === -1 ? "" : "s"} ago`;
  const parts = [p.claim.interest ? "interest" : "", p.claim.legalFee ? "legal fee" : ""].filter(Boolean).join(" + ");
  return (
    <main className="scr">
      <Top title="Escalate" fallback={`/deals/${p.id}`} />
      <div className="card">
        <p className="sub">Legal notice sent · {fmtDateLong(p.sentOn)}{p.channel ? ` by ${p.channel === "email" ? "email" : "WhatsApp"}` : ""}</p>
        <p className="big">{inr(p.claim.total)}</p>
        <p className="sub">Claimed from {p.brand}: {inr(p.claim.principal)} unpaid{parts ? ` + ${parts}` : ""}.</p>
        <a className="sub" href={`/api/deals/${p.id}/notice`} target="_blank" rel="noopener">View the notice</a>
      </div>
      <h2>What happens next</h2>
      <div className="item" style={{ cursor: "default" }}>
        <span className="l">
          <span className="t">1 · Wait for the notice period</span>
          <span className="s">{left >= 0 ? `${p.brand} has until ${fmtDateLong(deadline)} to pay. Most brands pay or reply in this window.` : `The ${NOTICE_DAYS}-day period ended on ${fmtDateLong(deadline)} without payment.`}</span>
        </span>
        <Chip tone={left >= 0 ? "info" : "over"}>{period}</Chip>
      </div>
      <Link className="item" href={`/deals/${p.id}/payment`}>
        <span className="l"><span className="t">Brand paid?</span><span className="s">Record the payment to close the deal</span></span>
        <span aria-hidden="true">›</span>
      </Link>
      <Link className="item" href={`/deals/${p.id}/legal-call`}>
        <span className="l">
          <span className="t">2 · Talk to the legal team</span>
          <span className="s">{p.callSlot ? `Call booked · ${fmtSlot(p.callSlot)}` : `${LEGAL_CALL.minutes}-minute call with ${ADVOCATE.firm} to plan the next step`}</span>
        </span>
        <Chip tone={p.callSlot ? "ok" : "info"}>{p.callSlot ? "Booked" : `${inr(LEGAL_CALL.feePaise)} · ${LEGAL_CALL.minutes} min`}</Chip>
      </Link>
      {p.udyam && <SamadhaanItem dealId={p.id} />}
      <div className="info">
        {left >= 0 ? "Give the brand the full notice period before the next step. " : "The notice period is over: book a call to decide on a complaint or a recovery suit. "}
        <Link href={`/deals/${p.id}/notice`}>Send the notice again</Link>
      </div>
    </main>
  );
}
