import Link from "next/link";
import { BetaNote, Done } from "@/components/ui";
import { ADVOCATE, LEGAL_CALL } from "@creator-assist/shared/advocate";
import { webCtx } from "@/server/context";
import { legalCallBooking } from "@/server/escalations";
import { fmtSlot } from "@creator-assist/shared/slots";

export default async function LegalCallBooked({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ b?: string }> }) {
  const [{ id }, { b }] = await Promise.all([params, searchParams]);
  const ctx = await webCtx();
  const data = b ? await legalCallBooking(ctx, b) : null;
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
