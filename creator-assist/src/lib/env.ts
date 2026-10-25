// Server-side env access. Public Supabase values are also read in the browser.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function siteUrl(): string {
  // Prefer an explicit URL, then the project's stable production domain (per-deployment
  // URLs can sit behind Vercel deployment protection, which would block brands).
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const u = process.env.NEXT_PUBLIC_SITE_URL || (host ? `https://${host}` : "http://localhost:3000");
  return u.replace(/\/$/, "");
}

export type Owner = { phone: string; name: string; handle: string; email: string; city: string; state: string };

export function demoOwner(): Owner | null {
  const phone = process.env.DEMO_OWNER_PHONE;
  if (!phone) return null;
  return {
    phone,
    name: process.env.DEMO_OWNER_NAME || "Demo Creator",
    handle: process.env.DEMO_OWNER_HANDLE || "",
    email: process.env.DEMO_OWNER_EMAIL || "",
    city: process.env.DEMO_OWNER_CITY || "Hyderabad",
    state: process.env.DEMO_OWNER_STATE || "Telangana",
  };
}

/** Digits only, Indian numbers normalised to 91XXXXXXXXXX. */
export function normPhone(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d;
}

export function isOwnerPhone(phone: string | null | undefined): boolean {
  const o = process.env.DEMO_OWNER_PHONE;
  return !!o && !!phone && normPhone(o) === normPhone(phone);
}

/**
 * The demo owner, by verified sign-in identity only (Supabase auth user, never
 * editable profile fields): their phone, or DEMO_OWNER_EMAIL while phone
 * sign-in is not live.
 */
export function isOwner(user: { phone?: string | null; email?: string | null; email_confirmed_at?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (isOwnerPhone(user.phone)) return true;
  const e = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase();
  return !!e && !!user.email_confirmed_at && user.email?.trim().toLowerCase() === e;
}
