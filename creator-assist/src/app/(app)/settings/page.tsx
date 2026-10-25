import { cookies } from "next/headers";
import Link from "next/link";
import { clearSampleData } from "@/app/actions/sample";
import { signOut } from "@/app/actions/settings";
import { SubmitButton, ThemeSwitch } from "@/components/client";
import { Row } from "@/components/ui";
import { getTax, requireProfile } from "@/lib/data";
import { isOwner } from "@/lib/env";
import { DeleteAccount, RatesForm, ReminderForm } from "./forms";

export const metadata = { title: "Settings · Creator Assist" };

export default async function Settings() {
  const { db, profile, user } = await requireProfile();
  const tax = await getTax(db);
  const { count: sampleCount } = await db.from("deals").select("id", { count: "exact", head: true }).eq("is_sample", true);
  const theme = (await cookies()).get("theme")?.value;

  return (
    <main className="scr">
      <h1>Settings</h1>
      <div className="card">
        <div className="row"><h2>Profile</h2><Link className="linkbtn" href="/settings/profile">Edit</Link></div>
        <Row k="Name" v={profile.name} />
        <Row k="Handle" v={profile.handle ?? "—"} />
        <Row k="Email" v={profile.email ?? "—"} />
        <Row k="Phone" v={profile.phone ?? "—"} />
      </div>
      <div className="card">
        <div className="row"><h2>Tax and bank</h2><Link className="linkbtn" href="/settings/profile">Edit</Link></div>
        <Row k="PAN" v={profile.pan_masked ?? "—"} />
        <Row k="GSTIN" v={profile.gstin ?? "Not registered"} />
        <Row k="Udyam" v={profile.udyam_no ?? "—"} />
        <Row k="Bank" v={profile.bank_account_last4 ? `${(profile.bank_name ?? "").replace(/ Bank$/, "")} ••${profile.bank_account_last4}` : "—"} />
        <Row k="Invoice prefix" v={profile.invoice_prefix} />
      </div>
      <div className="card">
        <h2>Appearance</h2>
        <ThemeSwitch initial={theme === "light" || theme === "dark" ? theme : "system"} />
        <p className="sub">System follows your phone&apos;s light or dark setting.</p>
      </div>
      <ReminderForm ladder={profile.reminder_ladder.join(", ")} whatsapp={profile.remind_whatsapp} email={profile.remind_email} language={profile.language} terms={profile.default_terms_days} />
      <RatesForm tax={tax} />

      <div className="card">
        <h2>Your data</h2>
        {(sampleCount ?? 0) > 0 ? (
          <form action={clearSampleData}>
            <SubmitButton className="btn sec" pendingText="Clearing…">Clear sample data</SubmitButton>
          </form>
        ) : <p className="sub">No sample data in your account. Load it from an empty Home screen.</p>}
        <a className="btn sec" href="/api/export" download>Export my data</a>
        <DeleteAccount />
      </div>
      {isOwner(user) && <Link className="btn sec" href="/admin">Admin dashboard</Link>}
      <form action={signOut}><SubmitButton className="btn sec" pendingText="Logging out…">Log out</SubmitButton></form>
      <p className="sub" style={{ textAlign: "center" }}>Creator Assist beta · PAN and bank numbers are encrypted.</p>
    </main>
  );
}
