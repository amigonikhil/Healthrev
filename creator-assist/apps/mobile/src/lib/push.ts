import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./api";

const TOKEN_KEY = "ca_push_token";
const ASKED_KEY = "ca_push_asked";

// Show notifications that arrive while the app is open, too (as a banner, no sound).
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export type PushState = "on" | "off" | "denied" | "unavailable";

const projectId = () => (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? Constants.easConfig?.projectId;

/** Can this build receive pushes at all (a real phone, and an EAS project for the token)? */
export const pushAvailable = () => Platform.OS !== "web" && Device.isDevice && !!projectId();

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return "unavailable";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "denied") return "denied";
  return status === "granted" && (await SecureStore.getItemAsync(TOKEN_KEY)) ? "on" : "off";
}

/** Asks the OS (if it hasn't been asked) and registers this phone with the server. */
export async function turnOnPush(): Promise<PushState> {
  if (!pushAvailable()) return "unavailable";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Payments and reminders", importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  await SecureStore.setItemAsync(ASKED_KEY, "1");
  if (status !== "granted") return "denied";
  const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId()! })).data;
  await api.push.register(token, Platform.OS === "ios" ? "ios" : "android");
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return "on";
}

/** Stops pushes to this phone (Settings switch, or sign-out). */
export async function turnOffPush(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try { await api.push.unregister(token); } catch { /* signed out already: the server drops it on next send */ }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** At start-up: re-register if notifications are on (tokens can change). Never prompts. */
export async function syncPush(): Promise<void> {
  try {
    if (!pushAvailable() || !(await SecureStore.getItemAsync(TOKEN_KEY))) return;
    if ((await Notifications.getPermissionsAsync()).status === "granted") await turnOnPush();
  } catch { /* retried next launch */ }
}

/** Should we offer notifications now? Once, after the first deal, if the OS hasn't been asked. */
export async function shouldOfferPush(): Promise<boolean> {
  if (!pushAvailable() || (await SecureStore.getItemAsync(ASKED_KEY))) return false;
  return (await Notifications.getPermissionsAsync()).status === "undetermined";
}
export const markPushOffered = () => SecureStore.setItemAsync(ASKED_KEY, "1");
