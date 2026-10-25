import { Row, Top } from "@/components/ui";
import { ADVOCATE, LEGAL_CALL } from "@/lib/advocate";
import { loadDealView } from "@/lib/data";
import { inr } from "@/lib/money";
import { callSlots } from "@/lib/slots";
import { LegalCallForm } from "./form";

export const metadata = { title: "Talk to the legal team · Creator Assist" };

export default async function LegalCall({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile, today } = await loadDealView(id);
  const fee = inr(LEGAL_CALL.feePaise);
  return (
    <main className="scr">
      <Top title="Talk to the legal team" fallback={`/deals/${id}/escalate`} />
      <div className="card">
        <h2>{LEGAL_CALL.minutes}-minute call with {ADVOCATE.firm}</h2>
        <ol className="tl">
          {[
            `Go over ${v.d.brand.name}'s response, or silence, to the notice.`,
            "Decide the next step: MSME complaint, civil recovery suit, or settling for part payment.",
            "Get the documents you'll need ready: agreement, invoice, reminders, chats.",
          ].map((t) => <li key={t}><span className="dot" style={{ background: "var(--acc)" }} /><span>{t}</span></li>)}
        </ol>
      </div>
      <div className="card">
        <Row k="Lawyer" v={`Adv. ${ADVOCATE.name}`} />
        <Row k="Deal" v={`${v.d.brand.name} · ${inr(v.remaining)} unpaid`} />
        <Row k="Fee" v={`${fee} · ${LEGAL_CALL.minutes} min`} strong />
      </div>
      <h2>Pick a time</h2>
      <LegalCallForm dealId={id} slots={callSlots(today, 1)} phone={profile.phone ?? ""} fee={fee} />
    </main>
  );
}
