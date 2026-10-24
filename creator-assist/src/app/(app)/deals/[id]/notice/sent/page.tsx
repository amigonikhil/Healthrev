import Link from "next/link";
import { BetaNote, Done } from "@/components/ui";

export default async function NoticeSent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="scr">
      <Done icon="⚖" tone="info" title="Sent for lawyer review">
        <p className="sub">Adv. S. Lakshmi will review the draft and share the final notice with you before it goes to the brand.</p>
        <BetaNote>not actually sent to a lawyer. Your draft is saved in the review queue and no fee was charged.</BetaNote>
        <Link className="btn" href={`/deals/${id}`}>Back to deal</Link>
      </Done>
    </main>
  );
}
