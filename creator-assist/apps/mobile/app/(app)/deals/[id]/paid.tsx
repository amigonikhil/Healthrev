import Ionicons from "@expo/vector-icons/Ionicons";
import { inr } from "@creator-assist/shared/money";
import { radius } from "@creator-assist/shared/tokens";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Skeleton, SubScreen, Txt } from "@/ui";

/** After Save payment: settled (reminders cancelled) or the balance still due. */
export default function Paid() {
  const { id, tds } = useLocalSearchParams<{ id: string; tds?: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { data } = useLoad(() => api.deals.get(id));
  const t = Number(tds) || 0;
  const v = data?.deal;
  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Payment recorded", headerBackVisible: false, gestureEnabled: false }} />
      {!v ? <Skeleton rows={2} /> : (
        <View style={{ alignItems: "center", gap: 14, paddingTop: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: c.stOk, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={40} color="#111111" />
          </View>
          <Txt v="h1Sub" accessibilityRole="header" style={{ textAlign: "center" }}>Payment recorded</Txt>
          <Txt color={c.muted} style={{ textAlign: "center" }}>
            {v.phase === "paid"
              ? `${v.d.brand.name} is marked paid. Pending reminders were cancelled${t ? ` and ${inr(t)} TDS was added to your Tax hub` : ""}.`
              : `${inr(v.remaining)} is still due from ${v.d.brand.name}. Reminders continue for the balance${t ? `, and ${inr(t)} TDS was added to your Tax hub` : ""}.`}
          </Txt>
        </View>
      )}
      <Button title="Open Tax hub" onPress={() => { router.dismissAll(); router.navigate("/tax"); }} />
      <Button title="Back to home" kind="secondary" onPress={() => { router.dismissAll(); router.navigate("/"); }} />
    </SubScreen>
  );
}
