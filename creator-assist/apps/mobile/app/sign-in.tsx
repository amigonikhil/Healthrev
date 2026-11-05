import { ApiError } from "@creator-assist/shared/api-client";
import { radius } from "@creator-assist/shared/tokens";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type TextInputInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, trackEvent } from "@/lib/api";
import { platform, supabase } from "@/lib/supabase";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Field, Note, Seg, TAP, Txt } from "@/ui";

type Mode = "phone" | "email";

/** 10-digit Indian numbers get +91; anything else must already carry a country code. */
function toE164(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  return "+" + d;
}
const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function SignIn() {
  const { c } = useTheme();
  const { config } = useSession();
  // Phone OTP needs SMS (DLT) to be live; until the server switches it on, start on email.
  const phoneOn = config?.signIn.phone ?? false;
  const [mode, setMode] = useState<Mode>(phoneOn ? "phone" : "email");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const codeRef = useRef<TextInputInstance>(null);

  // The config can arrive after first paint: follow it until the creator picks a method or types.
  const touched = useRef(false);
  useEffect(() => { if (!touched.current && !sent) setMode(phoneOn ? "phone" : "email"); }, [phoneOn, sent]);

  // OTP autofill (iOS keyboard suggestion from Messages / Mail, Android autofill) drops in all
  // six digits at once: verify straight away, once per code.
  const autoTried = useRef("");
  useEffect(() => {
    const digits = code.replace(/\D/g, "");
    if (sent && digits.length === 6 && !busy && autoTried.current !== digits) { autoTried.current = digits; void verify(); }
  }, [code, sent]); // eslint-disable-line react-hooks/exhaustive-deps

  const method = mode === "phone" ? "sms" : "email";
  const valid = mode === "phone" ? id.replace(/\D/g, "").length >= 10 : validEmail(id);
  const codeOk = code.replace(/\D/g, "").length >= 6;

  async function send() {
    setErr(""); setBusy(true);
    try {
      if (mode === "email") {
        // The server creates the account if needed (recording the platform) and emails the code.
        await api.emailCode(id.trim().toLowerCase());
      } else {
        // `data` lands in the new user's metadata, so sign-ups are counted per platform.
        const { error } = await supabase.auth.signInWithOtp({ phone: toE164(id), options: { data: { platform } } });
        if (error) throw error;
      }
      trackEvent("otp_requested", "/signin", { method });
      setSent(true);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setErr(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(""); setBusy(true);
    const token = code.replace(/\D/g, "");
    const { error } = mode === "phone"
      ? await supabase.auth.verifyOtp({ phone: toE164(id), token, type: "sms" })
      : await supabase.auth.verifyOtp({ email: id.trim().toLowerCase(), token, type: "email" });
    if (error) {
      setBusy(false);
      return setErr(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check it, or ask for a new one." : error.message);
    }
    trackEvent("otp_verified", "/signin", { method });
    // The session listener takes it from here (Home, or setup for a new account).
  }

  function restart(next: Mode = mode) {
    touched.current = true;
    setMode(next); setSent(false); setCode(""); setErr("");
    if (next !== mode) setId("");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ backgroundColor: c.accent, borderRadius: radius.card, padding: 20, gap: 10 }}>
            <Txt v="small" w="bold" color={c.onAccent}>Creator Assist</Txt>
            <Txt v="h1Sub" color={c.onAccent} accessibilityRole="header">Get paid on time for every brand deal.</Txt>
            {["Agreements brands sign before you shoot", "GST invoices and payment reminders", "MSME interest on late payments", "TDS tracking for your CA"].map((t) => (
              <Txt key={t} w="medium" color={c.onAccent}>•  {t}</Txt>
            ))}
          </View>

          <Txt v="h1Sub" accessibilityRole="header">Sign in</Txt>
          <Txt color={c.muted}>We&apos;ll send a one-time code. No password needed.</Txt>

          {phoneOn && (
            <Seg label="Sign in with" value={mode} onChange={(m) => restart(m)}
              options={[{ value: "phone", label: "Mobile" }, { value: "email", label: "Email" }]} />
          )}

          {mode === "phone" ? (
            <Field
              label="Mobile number" value={id} onChangeText={(t) => { touched.current = true; setId(t); }} editable={!sent}
              keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" placeholder="+91 98765 43210"
              returnKeyType="next" onSubmitEditing={() => valid && !sent && send()}
            />
          ) : (
            <Field
              label="Email" value={id} onChangeText={(t) => { touched.current = true; setId(t); }} editable={!sent}
              keyboardType="email-address" textContentType="emailAddress" autoComplete="email" autoCapitalize="none" autoCorrect={false}
              placeholder="you@example.com" returnKeyType="next" onSubmitEditing={() => valid && !sent && send()}
            />
          )}

          {sent && (
            <Field
              ref={codeRef}
              label="Enter the 6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
              placeholder={mode === "phone" ? "Code from the SMS" : "Code from the email"} maxLength={8}
              returnKeyType="done" onSubmitEditing={() => codeOk && verify()}
              hint={mode === "phone" ? `Sent to ${toE164(id)}` : `Sent to ${id.trim()}`}
            />
          )}

          {err ? <Note tone="warn">{err}</Note> : null}

          <Button
            title={sent ? "Verify and continue" : "Send code"} busy={busy}
            disabled={!valid || (sent && !codeOk)}
            onPress={sent ? verify : send}
          />
          {sent && (
            <Pressable accessibilityRole="button" onPress={() => restart()} style={{ minHeight: TAP, alignItems: "center", justifyContent: "center" }}>
              <Txt w="semibold" color={c.text2} style={{ textDecorationLine: "underline" }}>
                Change {mode === "phone" ? "number" : "email"} or resend
              </Txt>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
