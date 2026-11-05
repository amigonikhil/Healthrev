// Per-weight imports so only the four faces we use are bundled.
import { SpaceGrotesk_400Regular } from "@expo-google-fonts/space-grotesk/400Regular";
import { SpaceGrotesk_500Medium } from "@expo-google-fonts/space-grotesk/500Medium";
import { SpaceGrotesk_600SemiBold } from "@expo-google-fonts/space-grotesk/600SemiBold";
import { SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk/700Bold";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import { Stack, usePathname, useRouter, type Href } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppLock } from "@/lib/app-lock";
import { OfflineBanner } from "@/lib/offline";
import { onPendingLink, peekPendingLink, setAppReady, setPendingLink, takePendingLink } from "@/lib/pending-link";
import { syncPush } from "@/lib/push";
import { PageTracker } from "@/lib/page-tracker";
import { SessionProvider, useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, ToastProvider, Txt } from "@/ui";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold });
  return (
    <SafeAreaProvider>
      <ShareIntentProvider options={{ resetOnBackground: true }}>
        <SessionProvider>
          <ToastProvider>
            <Gate fontsLoaded={fontsLoaded} />
          </ToastProvider>
        </SessionProvider>
      </ShareIntentProvider>
    </SafeAreaProvider>
  );
}

/** Signed out → sign-in; signed in without a profile → onboarding; otherwise the app. */
function Gate({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status, error, refresh } = useSession();
  const { c, scheme } = useTheme();
  const ready = fontsLoaded && (status !== "loading" || !!error);
  usePendingLinks(status === "ready" && ready);

  // Root background matches the theme (no white flash behind screens or the keyboard).
  useEffect(() => { void SystemUI.setBackgroundColorAsync(c.bg); }, [c.bg]);
  const splashDone = useRef(false);
  useEffect(() => { if (ready && !splashDone.current) { splashDone.current = true; void SplashScreen.hideAsync(); } }, [ready]);

  if (!ready) {
    // At launch the splash screen covers this; later (e.g. loading your account right after
    // sign-in) show a spinner rather than an empty screen.
    return splashDone.current ? (
      <View accessible accessibilityLabel="Loading" style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <ActivityIndicator size="large" color={c.text} />
      </View>
    ) : null;
  }
  if (status === "loading" && error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: "center", padding: 24, gap: 16 }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Txt v="h1Sub" accessibilityRole="header">Can&apos;t reach Creator Assist</Txt>
        <Txt color={c.muted}>{error}</Txt>
        <Button title="Try again" onPress={refresh} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <PageTracker />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Protected guard={status === "signedOut"}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={status === "needsProfile"}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={status === "ready"}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <OfflineBanner />
      <AppLock active={status === "ready"} />
    </>
  );
}

/**
 * Opens what the app was asked to show (a deep link, a notification tap, a shared chat) once
 * the creator is signed in, and keeps the push token fresh.
 */
function usePendingLinks(ready: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  // Taps on notifications: their data carries the screen to open.
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) setPendingLink(url);
      if (r) void Notifications.clearLastNotificationResponseAsync?.().catch(() => {});
    };
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setAppReady(ready);
    if (!ready) return;
    void syncPush();
    const flush = () => {
      const p = peekPendingLink();
      if (!p) return;
      takePendingLink();
      if (p !== pathname) router.push(p as Href);
    };
    flush();
    return onPendingLink(flush);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
