import { Stack } from "expo-router";
import { FONTS, useTheme } from "@/theme";

/**
 * Signed-in screens. The five tabs are the first screen; deal, tax and settings pages push on
 * top with the native header: swipe back on iOS, the system back button on Android.
 */
export default function AppLayout() {
  const { c } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontFamily: FONTS.bold, fontSize: 18 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Home" }} />
    </Stack>
  );
}
