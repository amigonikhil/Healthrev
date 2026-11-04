import type { ExpoConfig } from "expo/config";

// Only public values belong here: the API URL and the Supabase anon key. Everything
// sensitive (service role, encryption, email, AI keys) stays on the server.
const config: ExpoConfig = {
  name: "Creator Assist",
  slug: "creator-assist",
  scheme: "creatorassist",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "in.creatorassist.app",
    supportsTablet: false,
  },
  android: {
    package: "in.creatorassist.app",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#F6F4EE", dark: { backgroundColor: "#111111" }, imageWidth: 0 }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
