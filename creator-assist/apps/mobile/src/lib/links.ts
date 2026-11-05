import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as StoreReview from "expo-store-review";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Linking, Platform, Share } from "react-native";
import { api, trackEvent } from "./api";
import { WEB_URL } from "./env";

/** Opens WhatsApp with the message prefilled (a wa.me link). The creator presses send. */
export async function openWhatsApp(href: string, kind: string, screen: string): Promise<boolean> {
  trackEvent("whatsapp_clicked", screen, { kind });
  try { await Linking.openURL(href); return true; } catch { return false; }
}

/** A Creator Assist web page (About, the brand's signing page) in the in-app browser. */
export const openWeb = (pathOrUrl: string) =>
  WebBrowser.openBrowserAsync(pathOrUrl.startsWith("http") ? pathOrUrl : WEB_URL + pathOrUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });

/** Shares a link with the native share sheet (e.g. the agreement signing link). */
export const shareLink = (url: string, message: string) =>
  Share.share(Platform.OS === "ios" ? { url, message } : { message: `${message}\n${url}` });

/**
 * Downloads a signed-in file from the API (invoice / agreement PDF, data export) into the
 * cache and opens the share sheet so it can be saved to Files, sent on WhatsApp or emailed.
 */
export async function downloadAndShare(path: string, filename: string, mimeType: string): Promise<void> {
  const { url, headers } = await api.download(path);
  if (Platform.OS === "web") { await Linking.openURL(url); return; }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  const saved = await File.downloadFileAsync(url, file, { headers, idempotent: true });
  await Sharing.shareAsync(saved.uri, { mimeType, dialogTitle: filename, UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.json" });
}

/** After the first recorded payment, ask once for a store rating (the OS decides whether to show it). */
export async function maybeAskForRating(): Promise<void> {
  try {
    if (await SecureStore.getItemAsync("ca_rate_asked")) return;
    await SecureStore.setItemAsync("ca_rate_asked", "1");
    if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
  } catch { /* never block the payment flow */ }
}
