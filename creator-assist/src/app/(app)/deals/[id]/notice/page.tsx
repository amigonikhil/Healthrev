import { redirect } from "next/navigation";
import { Row, Top } from "@/components/ui";
import { loadDealView } from "@/lib/data";
import { noticeDraft } from "@/lib/notice";
import { NoticeForm } from "./form";

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile } = await loadDealView(id);
  if (v.phase !== "overdue") redirect(`/deals/${id}/escalate`);
  return (
    <main className="scr">
      <Top title="Lawyer notice" fallback={`/deals/${id}/escalate`} />
      <div className="card doc">
        <h3>Draft · demand notice for unpaid invoice</h3>
        <p>{noticeDraft(v, profile)}</p>
      </div>
      <div className="card">
        <Row k="Lawyer" v="Adv. S. Lakshmi, Hyderabad" />
        <Row k="Fee" v="₹1,499" />
        <Row k="Turnaround" v="2 working days" />
      </div>
      <NoticeForm dealId={id} />
    </main>
  );
}
