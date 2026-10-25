"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sendEmailCode } from "@/app/actions/auth";
import { Seg } from "@/components/client";

type Mode = "phone" | "email";

function toE164(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return input.startsWith("+") ? "+" + d : "+" + d;
}

export function SignInForm({ smsEnabled }: { smsEnabled: boolean }) {
  // When SMS isn't live yet (NEXT_PUBLIC_SMS_ENABLED=false), start on email.
  const [mode, setMode] = useState<Mode>(smsEnabled ? "phone" : "email");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  // The auth client is ~50 kB; load it on first use so sign-in paints fast.
  const auth = async () => (await import("@/lib/supabase/client")).createClient().auth;

  async function send() {
    setErr("");
    setBusy(true);
    if (mode === "email") {
      // Emailed by the app via Resend (see actions/auth.ts).
      const r = await sendEmailCode(id);
      setBusy(false);
      if (!r.ok) return setErr(r.error);
      return setSent(true);
    }
    const { error } = await (await auth()).signInWithOtp({ phone: toE164(id) });
    setBusy(false);
    if (error) return setErr(error.message);
    setSent(true);
  }

  async function verify() {
    setErr("");
    setBusy(true);
    const token = code.replace(/\s/g, "");
    const a = await auth();
    const { error } = mode === "phone"
      ? await a.verifyOtp({ phone: toE164(id), token, type: "sms" })
      : await a.verifyOtp({ email: id.trim().toLowerCase(), token, type: "email" });
    if (error) {
      setBusy(false);
      return setErr(error.message);
    }
    router.replace("/home");
    router.refresh();
  }

  const valid = mode === "phone" ? id.replace(/\D/g, "").length >= 10 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id.trim());

  return (
    <form
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => { e.preventDefault(); if (sent) verify(); else send(); }}
    >
      <Seg
        label="Sign in with" value={mode}
        options={[{ value: "phone", label: "Mobile" }, { value: "email", label: "Email" }]}
        onChange={(m) => { setMode(m); setSent(false); setId(""); setCode(""); setErr(""); }}
      />
      {mode === "phone" ? (
        <label className="f">Mobile number
          <input value={id} onChange={(e) => setId(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" disabled={sent} required />
        </label>
      ) : (
        <label className="f">Email
          <input value={id} onChange={(e) => setId(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" disabled={sent} required />
        </label>
      )}
      {sent && (
        <label className="f">Enter OTP
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="Code from the email" autoFocus required />
        </label>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" disabled={busy || !valid || (sent && code.replace(/\D/g, "").length < 4)}>
        {busy ? "Please wait…" : sent ? "Verify and continue" : "Send OTP"}
      </button>
      {sent && (
        <button type="button" className="linkbtn" style={{ alignSelf: "center" }} onClick={() => { setSent(false); setCode(""); }}>
          Change {mode === "phone" ? "number" : "email"} or resend
        </button>
      )}
    </form>
  );
}
