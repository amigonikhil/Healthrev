"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${siteUrl}/auth/confirm`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice(`We emailed a 6-digit code and a magic link to ${email}.`);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">RK Recovery Ops</h1>
          <p className="mt-1 text-sm text-muted">
            Back-office sign in · HDFC 4-wheeler recovery
          </p>
        </div>

        {step === "email" && (
          <form onSubmit={sendCode} className="space-y-4">
            <label className="block text-sm font-medium">
              Work email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@rksolutions.in"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send login code"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} className="space-y-4">
            <label className="block text-sm font-medium">
              6-digit code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.3em] outline-none focus:border-brand"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setNotice(null);
              }}
              className="w-full text-center text-xs text-muted hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}

        {notice && <p className="mt-4 text-xs text-muted">{notice}</p>}
        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
      </div>
    </main>
  );
}
