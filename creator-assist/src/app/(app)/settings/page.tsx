import { cookies } from "next/headers";
import Link from "next/link";
import { clearSampleData, trySampleData } from "@/app/actions/sample";
import { signOut } from "@/app/actions/settings";
import { SubmitButton, ThemeSwitch } from "@/components/client";
import { Lock } from "@/components/lock";
import { Head, Row } from "@/components/ui";
import { fyOf, todayIST } from "@creator-assist/shared/dates";
import { invoiceNumber } from "@creator-assist/shared/invoice";
import { webCtx } from "@/server/context";
import { settingsView } from "@/server/settings";
import { everyHours } from "@creator-assist/shared/reminder-schedule";
import { DeleteAccount, RatesForm, ReminderForm } from "./forms";

export const metadata = { title: "Settings · Creator Assist" };

export default async function Settings() {
  const { profile, tax, rateDefaults, templates, isAdmin, hasSampleData } = await settingsView(await webCtx());
  const theme = (await cookies()).get("theme")?.value;

  return (
    <main className="scr">
      <Head title="Settings" />
      <div className="card">
        <div className="row"><h2>Profile</h2><Link className="linkbtn" href="/settings/profile">Edit</Link></div>
        <Row k="Name" v={profile.name} />
        <Row k="Handle" v={profile.handle ?? "—"} />
        <Row k="Email" v={profile.email ?? "—"} />
        <Row k="Phone" v={profile.phone ?? "—"} />
      </div>
      <div className="card">
        <div className="row"><h2>Tax and bank</h2><Link className="linkbtn" href="/settings/profile">Edit</Link></div>
        <Row k={<>PAN <Lock /></>} v={profile.pan_masked ?? "—"} />
        <Row k="GSTIN" v={profile.gstin ?? "Not registered"} />
        <Row k="Udyam" v={profile.udyam_no ?? "—"} />
        <Row k={<>Bank <Lock /></>} v={profile.bank_account_last4 ? `${(profile.bank_name ?? "").replace(/ Bank$/, "")} ••${profile.bank_account_last4}` : "—"} />
        <Row k="Invoice prefix" v={profile.invoice_prefix} />
      </div>
      <div className="card">
        <h2>Appearance</h2>
        <ThemeSwitch initial={theme === "light" || theme === "dark" ? theme : "system"} />
        <p className="sub">System follows your phone&apos;s light or dark setting.</p>
      </div>
      <ReminderForm every={everyHours(profile.remind_every_hours)} whatsapp={profile.remind_whatsapp} email={profile.remind_email} language={profile.language} terms={profile.default_terms_days}
        preview={{ creator: profile.name, templates, invoiceNo: invoiceNumber(profile.invoice_prefix, fyOf(todayIST()), 1), dueDate: todayIST() }} />
      <RatesForm tax={tax} defaults={rateDefaults} />

      <div className="card">
        <h2>Your data</h2>
        {hasSampleData ? (
          <form action={clearSampleData}>
            <SubmitButton className="btn sec" pendingText="Clearing…">Clear sample data</SubmitButton>
          </form>
        ) : (
          <form action={trySampleData}>
            <SubmitButton className="btn sec" pendingText="Loading sample data…">Load sample data</SubmitButton>
          </form>
        )}
        <p className="sub">Sample deals are marked and never mix with your real ones. Clearing removes only them.</p>
        <a className="btn sec" href="/api/v1/account/export" download>Export my data</a>
        <DeleteAccount />
      </div>
      <Link className="item" href="/about">
        <span className="l"><span className="t">About &amp; data safety</span><span className="s">Who built this, what we store, how it&apos;s protected</span></span>
        <span aria-hidden>›</span>
      </Link>
      {isAdmin && <Link className="btn sec" href="/admin">Admin dashboard</Link>}
      <form action={signOut}><SubmitButton className="btn sec" pendingText="Logging out…">Log out</SubmitButton></form>
      <p className="sub" style={{ textAlign: "center" }}>Creator Assist beta · PAN and bank numbers are encrypted.</p>
    </main>
  );
}
