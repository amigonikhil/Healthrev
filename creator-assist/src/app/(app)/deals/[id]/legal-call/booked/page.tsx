import Link from "next/link";
import { BetaNote, Done } from "@/components/ui";
import { ADVOCATE, LEGAL_CALL } from "@/lib/advocate";
import { requireProfile } from "@/lib/data";
import { fmtSlot } from "@/lib/slots";

export default async function LegalCallBooked({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ b?: string }> }) {
  const [{ id }, { b }] = await Promise.all([params, searchParams]);
  const { db } = await requireProfile();
  const { data } = b ? await db.from("legal_call_bookings").select("slot, phone").eq("id", b).maybeSingle() : { data: null };
  return (
    <main className="scr">
      <Done icon="☎" tone="info" title="Call booked">
        <p className="sub">
          {ADVOCATE.firm} will call you{data ? ` on ${data.phone}` : ""} at {data ? fmtSlot(data.slot) : "your chosen slot"} for {LEGAL_CALL.minutes} minutes.
          Keep the agreement and any reply from the brand handy.
        </p>
        <BetaNote>no payment was taken and the call isn&apos;t actually scheduled yet. Your booking is saved so we can test the flow.</BetaNote>
        <Link className="btn" href={`/deals/${id}/escalate`}>Back to escalation</Link>
      </Done>
    </main>
  );
}
