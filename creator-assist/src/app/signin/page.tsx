import { SignInForm } from "./form";

export const metadata = { title: "Sign in · Creator Assist" };

export default function SignIn() {
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
      <p className="sub">We&apos;ll send a one-time code. No password needed.</p>
      <SignInForm smsEnabled={process.env.NEXT_PUBLIC_SMS_ENABLED !== "false"} />
    </main>
  );
}
