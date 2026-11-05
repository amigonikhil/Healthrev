import { STATES } from "@creator-assist/shared/states";
import { radius } from "@creator-assist/shared/tokens";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { AiNote, StepFooter } from "@/components/deal-steps";
import { StepHead, useDraft, useDraftLoading } from "@/components/deal-draft";
import { useFlag } from "@/lib/flags";
import { useTheme } from "@/theme";
import { CheckTag, Field, ListItem, LoadError, Seg, Select, Skeleton, SubScreen, TAP, Txt } from "@/ui";

const STATE_OPTIONS = STATES.map((s) => ({ value: s.name, label: `${s.name} (${s.code})` }));

/** Step 1: who the deal is with, who pays, and the payer's state (it decides the GST). */
export default function BrandStep() {
  const { w, error, reload } = useDraftLoading();
  if (!w) return <SubScreen>{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={5} />}</SubScreen>;
  return <BrandForm />;
}

function BrandForm() {
  const { c } = useTheme();
  const router = useRouter();
  const pasteOn = useFlag("deal_from_chat");
  const { o, d, setBrand, pickBrand, up, ai, check, touch, shown, validate } = useDraft();
  const b = d.brand;
  const err = shown(1);
  const agency = d.paidBy === "agency";
  const q = b.name.trim().toLowerCase();
  const suggestions = q ? o.brands.filter((x) => x.name.toLowerCase().includes(q) && x.name.toLowerCase() !== q).slice(0, 4) : [];

  return (
    <SubScreen footer={<StepFooter next="Next: deliverables" onNext={() => { if (validate(1)) router.push("/deals/new/deliverables"); }} />}>
      <StepHead step={1} title="Who's it for?" sub="The brand, who pays you, and where the payer is based." />
      {ai ? <AiNote step={1} /> : pasteOn ? (
        <ListItem title="Paste a chat instead" sub="We'll fill this in from the brand's message or a screenshot" onPress={() => router.push("/deals/paste")} />
      ) : null}

      <Field
        label="Brand" check={check("brand_name")} error={err.brand} value={b.name}
        onChangeText={(v) => { touch("brand_name"); const hit = o.brands.find((x) => x.name.toLowerCase() === v.trim().toLowerCase()); if (hit) pickBrand(hit); else setBrand("name", v); }}
        placeholder="Voltra Motors Pvt Ltd" textContentType="organizationName" autoCorrect={false} returnKeyType="next"
      />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Saved brands">
          {suggestions.map((x) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Use saved brand ${x.name}`} onPress={() => pickBrand(x)}
              style={{ minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: "center" }}>
              <Txt v="chip" w="semibold">{x.name}</Txt>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt v="small" w="semibold" color={c.text2}>Who pays you?</Txt>
          {check("paid_by") && <CheckTag />}
        </View>
        <Seg label="Who pays you?" value={d.paidBy} onChange={(v) => { touch("paid_by"); up({ paidBy: v }); }}
          options={[{ value: "brand", label: "Brand directly" }, { value: "agency", label: "An agency" }]} />
      </View>
      {agency && (
        <Field label="Agency name" check={check("paid_by")} error={err.agency} value={b.agency_name}
          onChangeText={(v) => { touch("paid_by"); setBrand("agency_name", v); }} placeholder="Spark Agency" autoCorrect={false} />
      )}

      <Select
        label={agency ? "Agency's state (they're invoiced)" : "Brand's state"} check={check("billing_state")} error={err.state}
        hint={err.state ? undefined : "Decides IGST, or CGST + SGST, on your invoice."}
        value={b.state} options={STATE_OPTIONS} placeholder="Choose state"
        onChange={(v) => { touch("billing_state"); setBrand("state", v); }}
      />
      <Field label={agency ? "Agency GSTIN (optional)" : "Brand GSTIN (optional)"} error={err.gstin} value={b.gstin}
        onChangeText={(t) => setBrand("gstin", t.toUpperCase().replace(/\s/g, ""))} placeholder="29AAACV1234M1Z2" maxLength={15} autoCapitalize="characters" autoCorrect={false} />

      <Txt v="h2" accessibilityRole="header" style={{ marginTop: 4 }}>{agency ? "Agency contact" : "Brand contact"}</Txt>
      <Field label="Name" check={check("contact_name")} value={b.contact_name} onChangeText={(v) => { touch("contact_name"); setBrand("contact_name", v); }} placeholder="Arjun Mehta" autoComplete="off" />
      <Field label="Email" check={check("contact_email")} error={err.email} value={b.contact_email} onChangeText={(v) => { touch("contact_email"); setBrand("contact_email", v); }} placeholder="arjun@voltra.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" />
      <Field label="WhatsApp" check={check("contact_whatsapp")} value={b.contact_whatsapp} onChangeText={(v) => { touch("contact_whatsapp"); setBrand("contact_whatsapp", v); }} placeholder="+91 90000 12345" keyboardType="phone-pad" autoComplete="off" />
      <Txt v="small" color={c.muted}>Used for the agreement and payment reminders. You can add them later.</Txt>
    </SubScreen>
  );
}
