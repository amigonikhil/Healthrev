import type { ExpoConfig } from "expo/config";

// Only public values belong here: the API URL and the Supabase anon key. Everything
// sensitive (service role, encryption, email, AI keys) stays on the server.

/** The web app's host: https links to it open in the app (universal links / App Links). */
const LINK_HOST = process.env.APP_LINK_HOST || "creator-assist-neon.vercel.app";
/** Web paths with an app screen. The brand signing page (/s/…) always stays in the browser. */
const LINK_PATHS = ["/home", "/deals", "/brands", "/tax", "/settings"];
/**
 * The share target (iOS Share Extension, Android "share to" intent) can't be hidden by a remote
 * flag once installed, so it's a build switch: on for development builds, and for store builds
 * only once the deal_from_chat flag is going live (SHARE_TARGET=1 in that EAS profile).
 */
const SHARE_TARGET = process.env.SHARE_TARGET === "1";
/** FCM (Android push): path to google-services.json from the Firebase project (an EAS file env var; kept out of git). */
const googleServices = process.env.GOOGLE_SERVICES_JSON;

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
    associatedDomains: [`applinks:${LINK_HOST}`],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "in.creatorassist.app",
    ...(googleServices ? { googleServicesFile: googleServices } : {}),
    intentFilters: [{
      action: "VIEW",
      autoVerify: true,
      data: LINK_PATHS.map((p) => ({ scheme: "https", host: LINK_HOST, pathPrefix: p })),
      category: ["BROWSABLE", "DEFAULT"],
    }],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#F6F4EE", dark: { backgroundColor: "#111111" }, imageWidth: 0 }],
    ["expo-notifications", { color: "#FFD60A" }],
    ["expo-local-authentication", { faceIDPermission: "Unlock Creator Assist with Face ID." }],
    ["expo-image-picker", { photosPermission: "Choose a screenshot of a brand's message to fill in a deal.", cameraPermission: false, microphonePermission: false }],
    ...(SHARE_TARGET ? [["expo-share-intent", {
      iosActivationRules: { NSExtensionActivationSupportsText: true, NSExtensionActivationSupportsWebURLWithMaxCount: 1, NSExtensionActivationSupportsImageWithMaxCount: 1 },
      iosShareExtensionName: "Creator Assist",
      androidIntentFilters: ["text/*", "image/*"],
    }] as [string, Record<string, unknown>]] : []),
  ],
  experiments: { typedRoutes: true },
  extra: {
    // From `eas init` (Expo account). Push tokens need it; without it notifications stay off.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
    shareTarget: SHARE_TARGET,
  },
};

export default config;
