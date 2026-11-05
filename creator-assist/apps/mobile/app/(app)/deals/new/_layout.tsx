import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { DraftProvider } from "@/components/deal-draft";
import { useTheme } from "@/theme";
import { TAP, useHeaderOptions } from "@/ui";

// Opening /deals/new/money directly (a link) still puts Brand underneath.
export const unstable_settings = { anchor: "index" };

/**
 * New paid collab, in three steps: Brand → Deliverables → Fee & payment. Each step is its own
 * screen in this stack (swipe back / the back button goes one step back); the draft lives here.
 */
export default function NewDealLayout() {
  const { c } = useTheme();
  const router = useRouter();
  const header = useHeaderOptions();
  return (
    <DraftProvider>
      <Stack screenOptions={{ ...header, title: "New paid collab" }}>
        <Stack.Screen
          name="index"
          options={{
            headerLeft: () => (
              <Pressable accessibilityRole="button" accessibilityLabel="Close without saving" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={8}
                style={{ minWidth: TAP, minHeight: TAP, justifyContent: "center" }}>
                <Ionicons name="close" size={26} color={c.text} />
              </Pressable>
            ),
          }}
        />
        <Stack.Screen name="deliverables" />
        <Stack.Screen name="money" />
      </Stack>
    </DraftProvider>
  );
}
