import type { OnboardInput, UpdateProfileInput } from "@creator-assist/shared/api";
import { STATES } from "@creator-assist/shared/states";
import type { Profile } from "@creator-assist/shared/types";
import { useState } from "react";
import { View, type ScrollViewInstance } from "react-native";
import { errorText } from "@/lib/use-load";
import { openWeb } from "@/lib/links";
import { useTheme } from "@/theme";
import { Button, Field, LinkButton, Note, Select, Toggle, Txt } from "@/ui";

const STATE_OPTIONS = STATES.map((s) => ({ value: s.name, label: `${s.name} (${s.code})` }));
const upper = (t: string) => t.toUpperCase().replace(/\s/g, "");

/**
 * Onboarding (two steps, PAN and bank required, consent) and Edit profile (one page, blank PAN or
 * bank keeps the stored one). Same fields and server validation as the web form.
 */
export function ProfileForm({ mode, profile, needPhone, defaultEmail, onSubmit, scrollRef }: {
  mode: "onboard" | "edit"; profile?: Profile | null; needPhone?: boolean; defaultEmail?: string;
  onSubmit: (input: OnboardInput | UpdateProfileInput) => Promise<void>;
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
}) {
  const { c } = useTheme();
  const editing = mode === "edit";
  const [step, setStep] = useState(editing ? 2 : 1);
  const [f, setF] = useState({
    handle: profile?.handle ?? "", email: profile?.email ?? defaultEmail ?? "", phone: "", city: profile?.city ?? "", address: profile?.address ?? "",
    name: profile?.name ?? "", pan: "", state: profile?.state ?? "Telangana", gstin: profile?.gstin ?? "", udyam: profile?.udyam_no ?? "",
    bank: "", ifsc: profile?.ifsc ?? "", upi: profile?.upi ?? "", prefix: profile?.invoice_prefix ?? "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const top = () => scrollRef?.current?.scrollTo({ y: 0, animated: true });

  async function submit() {
    setErr(""); setBusy(true);
    const base = {
      name: f.name.trim(), state: f.state, gstin: f.gstin, udyam: f.udyam, ifsc: f.ifsc, upi: f.upi,
      email: f.email, handle: f.handle, city: f.city, address: f.address, pan: f.pan, bankAccount: f.bank,
    };
    try {
      await onSubmit(editing ? { ...base, invoicePrefix: f.prefix } : { ...base, consent, phone: needPhone ? f.phone : undefined });
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  if (step === 1) {
    return (
      <View style={{ gap: 14 }}>
        <Txt v="small" w="semibold" color={c.muted}>Step 1 of 2</Txt>
        <Txt v="h1Sub" accessibilityRole="header">About you</Txt>
        <Txt color={c.muted}>How brands know you. You can change this later in Settings.</Txt>
        <Field label="Instagram / YouTube handle" value={f.handle} onChangeText={set("handle")} placeholder="@yourhandle" autoCapitalize="none" autoCorrect={false} textContentType="nickname" />
        <Field label="Email for brand communication" value={f.email} onChangeText={set("email")} placeholder="collabs@you.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" />
        {needPhone && <Field label="Mobile number" value={f.phone} onChangeText={set("phone")} placeholder="+91 98765 43210" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" />}
        <Field label="City" value={f.city} onChangeText={set("city")} placeholder="Hyderabad" textContentType="addressCity" />
        <Field label="Address for invoices" value={f.address} onChangeText={set("address")} placeholder="Area, city, PIN" textContentType="fullStreetAddress" multiline />
        <Button title="Continue" onPress={() => { setStep(2); top(); }} />
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {!editing && (<>
        <Txt v="small" w="semibold" color={c.muted}>Step 2 of 2</Txt>
        <Txt v="h1Sub" accessibilityRole="header">Business and bank details</Txt>
        <Txt color={c.muted}>These go on your invoices and agreements.</Txt>
      </>)}
      {editing && (<>
        <Txt v="h2" accessibilityRole="header">Profile</Txt>
        <Field label="Instagram / YouTube handle" value={f.handle} onChangeText={set("handle")} placeholder="@yourhandle" autoCapitalize="none" autoCorrect={false} />
        <Field label="Email for brand communication" value={f.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field label="City" value={f.city} onChangeText={set("city")} />
        <Field label="Address for invoices" value={f.address} onChangeText={set("address")} multiline />
        <Txt v="h2" accessibilityRole="header" style={{ marginTop: 8 }}>Tax and bank</Txt>
      </>)}
      <Field label="Full name (as on PAN)" value={f.name} onChangeText={set("name")} textContentType="name" autoComplete="name" />
      <Field
        label="PAN (encrypted)" value={f.pan} onChangeText={(t) => set("pan")(upper(t))} maxLength={10} autoCapitalize="characters" autoCorrect={false}
        placeholder={editing ? `${profile?.pan_masked ?? ""} · leave blank to keep` : "ABCDE1234F"} autoComplete="off" importantForAutofill="no"
      />
      <Select label="State" value={f.state} options={STATE_OPTIONS} onChange={set("state")} />
      <Field label="GSTIN (if registered)" value={f.gstin} onChangeText={(t) => set("gstin")(upper(t))} placeholder="36ABCDE1234F1Z5" maxLength={15} autoCapitalize="characters" autoCorrect={false} />
      <Field label="Udyam (MSME) number" value={f.udyam} onChangeText={(t) => set("udyam")(upper(t))} placeholder="UDYAM-TS-02-0012345" autoCapitalize="characters" autoCorrect={false} />
      <Field
        label="Bank account (encrypted)" value={f.bank} onChangeText={(t) => set("bank")(t.replace(/\D/g, ""))} keyboardType="number-pad"
        placeholder={editing ? `••${profile?.bank_account_last4 ?? ""} · leave blank to keep` : "Account number"} autoComplete="off" importantForAutofill="no"
      />
      <Field label="IFSC" value={f.ifsc} onChangeText={(t) => set("ifsc")(upper(t))} placeholder="HDFC0001234" maxLength={11} autoCapitalize="characters" autoCorrect={false} />
      <Field label="UPI ID" value={f.upi} onChangeText={set("upi")} placeholder="you@hdfcbank" autoCapitalize="none" autoCorrect={false} />
      {editing && <Field label="Invoice prefix" value={f.prefix} onChangeText={(t) => set("prefix")(upper(t))} maxLength={8} autoCapitalize="characters" />}
      <LinkButton title="Why we ask, and how it's protected" onPress={() => void openWeb("/about")} hint="Opens About & data safety" />
      {!editing && <Toggle label="I consent to storing these details. PAN and bank are encrypted." value={consent} onChange={setConsent} />}
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title={editing ? "Save" : "Finish setup"} busy={busy} onPress={submit} disabled={!editing && !consent} />
      {!editing && <Button title="Back" kind="secondary" onPress={() => { setStep(1); top(); }} />}
    </View>
  );
}
