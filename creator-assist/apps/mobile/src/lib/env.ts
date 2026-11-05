// Public build-time settings (EXPO_PUBLIC_* are inlined into the bundle). Only the API
// URL and the Supabase anon key belong here; nothing secret ever ships in the app.
import { Platform } from "react-native";

const required = (name: string, v: string | undefined) => {
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return v;
};

/** Browser preview only: a URL given as a path ("/api/v1") is on the page's own host (a dev proxy). */
const onPageHost = (u: string) => (Platform.OS === "web" && u.startsWith("/") && typeof window !== "undefined" ? window.location.origin + u : u);

export const API_URL = onPageHost(required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL)).replace(/\/$/, "");
/** The web app (brand signing links, onboarding on the web) is the API's host. */
export const WEB_URL = API_URL.replace(/\/api\/v1$/, "");
export const SUPABASE_URL = onPageHost(required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL));
export const SUPABASE_ANON_KEY = required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
