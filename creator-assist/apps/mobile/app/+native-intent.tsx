import Constants from "expo-constants";
import { getShareExtensionKey } from "expo-share-intent";
import { routeForUrl } from "@creator-assist/shared/app-links";
import { appIsReady, setPendingLink } from "@/lib/pending-link";

/**
 * Every URL the OS opens the app with passes through here first: creatorassist:// links,
 * https links to the web app, notification taps with a link, and chats shared into the app.
 * If the creator isn't signed in yet, the path is kept and opened after they sign in.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const scheme = (Array.isArray(Constants.expoConfig?.scheme) ? Constants.expoConfig?.scheme[0] : Constants.expoConfig?.scheme) ?? "creatorassist";
    const route = routeForUrl(path, { scheme, shareKey: getShareExtensionKey() });
    // Signed in: the router opens it now. Otherwise remember it for after sign-in.
    if (!appIsReady()) setPendingLink(route);
    return route;
  } catch {
    return "/";
  }
}
