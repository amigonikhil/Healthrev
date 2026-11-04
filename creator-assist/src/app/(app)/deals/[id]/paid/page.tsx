import Link from "next/link";
import { Done } from "@/components/ui";
import { webCtx } from "@/server/context";
import { getDeal } from "@/server/deals";
import { orRedirect } from "@/server/forms";
import { inr } from "@creator-assist/shared/money";

export default async function PaidPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amt?: string; s?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const { v } = await orRedirect(getDeal(await webCtx(), id), "/deals");
  const tds = Number(q.amt) || 0;
  const settled = v.phase === "paid";
  return (
    <main className="scr">
      <Done icon="₹" title="Payment recorded">
        <p className="sub">
          {settled
            ? `${v.d.brand.name} is marked paid. Pending reminders were cancelled${tds ? ` and ${inr(tds)} TDS was added to your Tax hub` : ""}.`
            : `${inr(v.remaining)} is still due from ${v.d.brand.name}. Reminders continue for the balance${tds ? `, and ${inr(tds)} TDS was added to your Tax hub` : ""}.`}
        </p>
        <Link className="btn" href="/tax">Open Tax hub</Link>
        <Link className="btn sec" href="/home">Back to home</Link>
      </Done>
    </main>
  );
}
