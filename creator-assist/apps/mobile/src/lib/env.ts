// Public build-time settings (EXPO_PUBLIC_* are inlined into the bundle). Only the API
// URL and the Supabase anon key belong here; nothing secret ever ships in the app.
const required = (name: string, v: string | undefined) => {
  if (!v) throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`);
  return v;
};

export const API_URL = required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL).replace(/\/$/, "");
/** The web app (brand signing links, onboarding on the web) is the API's host. */
export const WEB_URL = API_URL.replace(/\/api\/v1$/, "");
export const SUPABASE_URL = required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
