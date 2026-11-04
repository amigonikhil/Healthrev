import { createApiClient } from "@creator-assist/shared/api-client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./env";
import { platform, supabase } from "./supabase";

/** The Creator Assist API (/api/v1), signed in with the current Supabase session. */
export const api = createApiClient({
  baseUrl: API_URL,
  platform,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});

// Same ids the web keeps in localStorage / sessionStorage: one per install, one per app launch.
const rid = () => Array.from({ length: 4 }, () => Math.random().toString(16).slice(2, 10)).join("-");
const session = rid();
let anon: Promise<string> | null = null;
const anonId = () => (anon ??= (async () => {
  try {
    let v = await SecureStore.getItemAsync("ca_anon");
    if (!v) { v = rid(); await SecureStore.setItemAsync("ca_anon", v); }
    return v;
  } catch { return "unknown"; }
})());

export type ClientEvent = "page_view" | "signin_opened" | "otp_requested" | "otp_verified" | "whatsapp_clicked";

/**
 * Screen views and taps for the admin metrics (ADMIN.md §10). `screen` uses the web's paths so
 * the funnel groups both apps together; the API client adds the platform. Never throws.
 */
export function trackEvent(name: ClientEvent, screen: string, props: Record<string, string> = {}) {
  void anonId().then((a) => api.event(name, { screen, anon: a, props: { ...props, session } }));
}
