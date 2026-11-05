import Ionicons from "@expo/vector-icons/Ionicons";
import { radius } from "@creator-assist/shared/tokens";
import * as Haptics from "expo-haptics";
import { Tabs, type BottomTabBarProps } from "expo-router/tabs";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Txt } from "@/ui";

type Icon = React.ComponentProps<typeof Ionicons>["name"];
const TABS: { name: string; title: string; icon: Icon; on: Icon }[] = [
  { name: "index", title: "Home", icon: "home-outline", on: "home" },
  { name: "deals", title: "Deals", icon: "document-text-outline", on: "document-text" },
  { name: "brands", title: "Brands", icon: "people-outline", on: "people" },
  { name: "tax", title: "Tax", icon: "calculator-outline", on: "calculator" },
  { name: "settings", title: "Settings", icon: "settings-outline", on: "settings" },
];

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      {TABS.map((t) => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />)}
    </Tabs>
  );
}

/**
 * The Bold Creator tab bar: a rounded #111 bar floating above the home indicator / Android
 * navigation bar, with the selected tab as a sunflower pill (same as the web's .nav).
 */
function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10), paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right }}>
      <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 2, backgroundColor: c.navBg, borderRadius: radius.card, padding: 6 }}>
        {state.routes.map((route, i) => {
          const focused = i === state.index;
          const t = TABS.find((x) => x.name === route.name);
          const title = descriptors[route.key]?.options.title ?? t?.title ?? route.name;
          const onPress = () => {
            const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) {
              if (Platform.OS === "ios") void Haptics.selectionAsync();
              navigateToTab(route.key);
            }
          };
          const fg = focused ? c.onAccent : c.navText;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={Platform.OS === "ios" ? `${title}, tab, ${i + 1} of ${state.routes.length}` : title}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => ({
                flex: 1, minHeight: 56, borderRadius: radius.tab, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 6,
                backgroundColor: focused ? c.accent : "transparent", opacity: pressed && !focused ? 0.7 : 1,
              })}
            >
              <Ionicons name={focused ? t?.on ?? "ellipse" : t?.icon ?? "ellipse-outline"} size={22} color={fg} />
              <Txt v="tab" w={focused ? "bold" : "semibold"} color={fg} numberOfLines={1} maxFontSizeMultiplier={1.4}>{title}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
