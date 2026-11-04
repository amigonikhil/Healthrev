import Link from "next/link";
import { BetaNote, Chip, Done } from "@/components/ui";
import { webCtx } from "@/server/context";
import { aiCallBooking } from "@/server/tax";

export default async function Booked({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const ctx = await webCtx();
  const b = id ? await aiCallBooking(ctx, id) : null;
  const when = b ? new Date(b.slot).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "your chosen slot";
  return (
    <main className="scr">
      <Done icon="✓" title="AI call booked">
        <p className="sub">We&apos;ll call you on {when}. After the call, your return goes to the CA. You&apos;ll get a notification to e-verify when it&apos;s filed.</p>
        <BetaNote>no call is actually scheduled and nothing will be filed. Your booking is saved so we can test the flow.</BetaNote>
        <div className="card" style={{ width: "100%", textAlign: "left" }}>
          <div className="row"><span>AI call</span><Chip tone="info">{when.split(",")[0]}</Chip></div>
          <div className="row"><span>CA review and filing</span><Chip tone="mute">After call</Chip></div>
          <div className="row"><span>You e-verify</span><Chip tone="mute">Aadhaar OTP</Chip></div>
        </div>
        <Link className="btn" href="/tax">Back to Tax hub</Link>
      </Done>
    </main>
  );
}
