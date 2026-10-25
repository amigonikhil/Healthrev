import { SignInForm } from "./form";
import { GoogleButton } from "./google";

export const metadata = { title: "Sign in · Creator Assist" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const google = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "true";
  return (
    <main className="scr">
      <div className="hero">
        <p style={{ fontWeight: 800, fontSize: 16 }}>Creator Assist</p>
        <p style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>Get paid on time for every brand deal.</p>
        <ul>
          <li>Agreements brands sign before you shoot</li>
          <li>GST invoices and auto reminders</li>
          <li>MSME interest and legal notices</li>
          <li>TDS tracking for your CA</li>
        </ul>
      </div>
      <h1>Sign in</h1>
      {error && <p className="err" role="alert">Sign-in didn&apos;t complete. Please try again.</p>}
      {google ? (<>
        <p className="sub">No password needed.</p>
        <GoogleButton />
        <p className="sub" style={{ textAlign: "center" }}>or get a one-time code</p>
      </>) : <p className="sub">We&apos;ll send a one-time code. No password needed.</p>}
      <SignInForm smsEnabled={process.env.NEXT_PUBLIC_SMS_ENABLED !== "false"} />
    </main>
  );
}
