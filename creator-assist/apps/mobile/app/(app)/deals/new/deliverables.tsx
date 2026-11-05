import Ionicons from "@expo/vector-icons/Ionicons";
import { DELIVERABLE_GROUPS, deliverableKey, deliverablesSummary, USAGE_MAX_MONTHS, USAGE_SCOPES } from "@creator-assist/shared/deliverables";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StepHead, useDraft, useDraftLoading } from "@/components/deal-draft";
import { AiNote, StepFooter } from "@/components/deal-steps";
import { useTheme } from "@/theme";
import { Card, CheckTag, DateField, Hr, Note, Select, Skeleton, Stepper, SubScreen, TAP, Toggle, Txt } from "@/ui";

/** Step 2: what the creator will post, the brand's usage rights and the go-live date. */
export default function DeliverablesStep() {
  return useDraftLoading().w ? <Deliverables /> : <SubScreen><Skeleton rows={5} /></SubScreen>;
}

function Deliverables() {
  const { c } = useTheme();
  const router = useRouter();
  const { o, d, up, chosen, check, touch, shown, validate } = useDraft();
  const err = shown(2);
  // Open the first group that has something ticked (a pasted chat), else Instagram.
  const [openGroup, setOpenGroup] = useState<string | null>(
    () => DELIVERABLE_GROUPS.find((g) => g.items.some((x) => d.picked[deliverableKey(x)]))?.group ?? DELIVERABLE_GROUPS[0].group,
  );

  return (
    <SubScreen footer={<StepFooter back next="Next: fee & payment" onNext={() => { if (validate(2)) router.push("/deals/new/money"); }} />}>
      <StepHead step={2} title="What will you post?" sub="Tick everything in the deal and set how many of each." />
      <AiNote step={2} />

      <Card style={check("deliverables") ? { borderWidth: 2, borderColor: c.accent } : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt v="h2" accessibilityRole="header" style={{ flex: 1 }}>Deliverables</Txt>
          {check("deliverables") && <CheckTag />}
        </View>
        <Txt v="small" w="semibold" color={chosen.length ? c.text2 : c.muted} accessibilityLiveRegion="polite">
          {chosen.length ? deliverablesSummary(chosen, ", ") : "Nothing ticked yet"}
        </Txt>
        {err.deliverables ? <Note tone="warn">{err.deliverables}</Note> : null}
        {DELIVERABLE_GROUPS.map((g) => {
          const n = g.items.filter((x) => d.picked[deliverableKey(x)]).length;
          const open = openGroup === g.group;
          return (
            <View key={g.group} style={{ gap: 4 }}>
              <Hr />
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${g.group}${n ? `, ${n} selected` : ""}`}
                onPress={() => setOpenGroup(open ? null : g.group)} style={{ minHeight: TAP, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt w="bold" style={{ flex: 1 }}>{g.group}{n ? <Txt v="small" w="semibold" color={c.muted}>  · {n} selected</Txt> : null}</Txt>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={c.muted} />
              </Pressable>
              {open && g.items.map((x) => {
                const k = deliverableKey(x);
                const on = !!d.picked[k];
                return (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: TAP }}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={x.label}
                      onPress={() => { touch("deliverables"); up({ picked: { ...d.picked, [k]: !on } }); }}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: TAP }}>
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? c.text : c.muted} />
                      <Txt style={{ flex: 1 }}>{x.label}</Txt>
                    </Pressable>
                    {on && <Stepper label={x.unit ? x.label : `${x.label} quantity`} value={d.qty[k] ?? x.defaultQty} max={x.unit === "days" ? 365 : 99}
                      onChange={(v) => { touch("deliverables"); up({ qty: { ...d.qty, [k]: v } }); }} />}
                  </View>
                );
              })}
            </View>
          );
        })}
      </Card>

      <Card style={check("usage_rights") ? { borderWidth: 2, borderColor: c.accent } : undefined}>
        {check("usage_rights") && <CheckTag />}
        <Toggle label="Usage rights for the brand" hint="Lets the brand reuse your content. Included in your fee." value={d.usage} onChange={(v) => { touch("usage_rights"); up({ usage: v }); }} />
        {d.usage && (<>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: d.perpetual ? 0.45 : 1 }}>
            <Txt>Duration (months)</Txt>
            <Stepper label="Usage months" value={d.months} max={USAGE_MAX_MONTHS} onChange={(v) => { touch("usage_rights"); up({ months: v }); }} disabled={d.perpetual} />
          </View>
          <Toggle label="Perpetual (no end date)" value={d.perpetual} onChange={(v) => { touch("usage_rights"); up({ perpetual: v }); }} />
          <Select label="Where can they use it?" value={d.scope} options={USAGE_SCOPES.map((u) => ({ value: u.value, label: u.label }))} onChange={(v) => { touch("usage_rights"); up({ scope: v }); }} />
          <Txt v="small" color={c.muted}>Included in your fee.</Txt>
        </>)}
      </Card>

      <DateField label="Go-live date" check={check("go_live_date")} value={d.goLive} onChange={(v) => { touch("go_live_date"); up({ goLive: v }); }} min={o.today} clearable placeholder="Optional" />
    </SubScreen>
  );
}
