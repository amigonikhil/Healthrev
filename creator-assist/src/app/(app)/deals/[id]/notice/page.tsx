import { redirect } from "next/navigation";
import { Row, Top } from "@/components/ui";
import { ADVOCATE, NOTICE_DAYS } from "@/lib/advocate";
import { loadDealView } from "@/lib/data";
import { inr } from "@/lib/money";
import { noticeFor } from "@/lib/notice-data";
import { NoticeForm } from "./form";

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile } = await loadDealView(id);
  if (v.phase !== "overdue") redirect(`/deals/${id}/escalate`);
  const n = noticeFor(v, profile);
  return (
    <main className="scr">
      <Top title="Lawyer notice" fallback={`/deals/${id}/escalate`} />
      <div className="card doc">
        <h3>Draft · demand notice for unpaid invoice</h3>
        <p><b>Subject:</b> {n.subject}</p>
        <p>Calls on {n.to[1]} to pay {inr(v.remaining)} within {NOTICE_DAYS} days, on {ADVOCATE.firm}&apos;s letterhead, signed by {ADVOCATE.name}.</p>
        <a className="btn sec" href={`/api/deals/${id}/notice`} target="_blank" rel="noopener">View notice PDF</a>
      </div>
      <div className="card">
        <Row k="Lawyer" v={`Adv. ${ADVOCATE.name}, ${ADVOCATE.city}`} />
        <Row k="Fee" v={ADVOCATE.fee} />
        <Row k="Turnaround" v={ADVOCATE.turnaround} />
      </div>
      <NoticeForm dealId={id} />
    </main>
  );
}
