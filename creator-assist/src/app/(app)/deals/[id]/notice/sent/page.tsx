import Link from "next/link";
import { BetaNote, Done } from "@/components/ui";
import { ADVOCATE } from "@/lib/advocate";

export default async function NoticeSent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="scr">
      <Done icon="⚖" tone="info" title="Sent for lawyer review">
        <p className="sub">Adv. {ADVOCATE.name} will review the draft and share the final notice with you before it goes to the brand.</p>
        <BetaNote>not actually sent to a lawyer. Your draft is saved in the review queue and no fee was charged.</BetaNote>
        <a className="btn sec" href={`/api/deals/${id}/notice`} target="_blank" rel="noopener">View notice PDF</a>
        <Link className="btn" href={`/deals/${id}`}>Back to deal</Link>
      </Done>
    </main>
  );
}
