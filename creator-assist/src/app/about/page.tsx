import Link from "next/link";
import { Lock } from "@/components/lock";
import { Avatar, Top } from "@/components/ui";
import { demoOwner } from "@/lib/env";

export const metadata = { title: "About & data safety · Creator Assist" };

export default async function About({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const owner = demoOwner();
  const builder = owner?.name ?? "The Creator Assist team";
  return (
    <main className="scr">
      <Top title="About & data safety" fallback={from === "onboarding" ? "/onboarding" : "/settings"} />

      <div className="card">
        <h2>Who built this</h2>
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <Avatar name={builder} />
          <span><b style={{ color: "var(--text)" }}>{builder}</b><br />Founder, Creator Assist</span>
        </div>
        <p className="sub">Creator Assist is being built{owner?.city ? ` in ${owner.city}` : ""} with creators who were tired of chasing brands for payment. (Photo and a short bio coming soon.)</p>
      </div>

      <div className="card">
        <h2>What we store, and why</h2>
        <ul className="plain">
          <li><b>Your profile</b> (name, handle, email, phone, address): to put on your agreements and invoices.</li>
          <li><b>PAN, GSTIN, Udyam, bank and UPI</b>: invoices must show them so brands can pay you and deduct TDS correctly.</li>
          <li><b>Your deals and brand contacts</b>: to create agreements, invoices and payment reminders.</li>
          <li><b>Payments and TDS you record, and AIS files you upload</b>: to show what you&apos;re owed and match TDS for your return.</li>
          <li><b>How you use the app</b> (screens opened, buttons tapped, feedback): to find what&apos;s confusing and fix it during the beta.</li>
        </ul>
      </div>

      <div className="card">
        <h2>How we protect it</h2>
        <p className="sub"><Lock /> Your PAN and bank account number are encrypted before they&apos;re saved, and only shown masked (ABCDE••••F, ••4417).</p>
        <p className="sub">Every account can only read its own data. Brands only see what you send them: the agreement, the invoice and your reminders.</p>
        <p className="sub"><b>We never share or sell your data to brands</b> or anyone else.</p>
      </div>

      <div className="card">
        <h2>Export or delete your data</h2>
        <p className="sub">Settings → Your data → <b>Export my data</b> downloads everything in your account as one file. <b>Delete my account</b> permanently removes your profile, deals, invoices, reminders and uploaded files.</p>
        <Link className="btn sec" href="/settings">Go to Settings</Link>
      </div>
    </main>
  );
}
