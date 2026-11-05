import { Stack } from "expo-router";
import { PushOffer } from "@/components/push-offer";
import { useHeaderOptions } from "@/ui";

// A screen opened straight from a link, a notification or the share sheet still has Home
// underneath, so Back / Close always has somewhere to go.
export const unstable_settings = { anchor: "(tabs)" };

/**
 * Signed-in screens. The five tabs are the first screen; deal, tax and settings pages push on
 * top with the native header: swipe back on iOS, the system back button on Android.
 */
export default function AppLayout() {
  const header = useHeaderOptions();
  return (<>
    <Stack screenOptions={header}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
      {/* The New deal wizard has its own stack and header (one screen per step). */}
      <Stack.Screen name="deals/new" options={{ headerShown: false }} />
    </Stack>
    <PushOffer />
  </>);
}
