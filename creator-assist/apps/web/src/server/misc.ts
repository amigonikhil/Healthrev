import "server-only";
import type { AppConfig, FeatureFlag } from "@creator-assist/shared/api";
import { getSetting } from "@/lib/app-settings";
import { track as trackEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { fail, track, type Ctx, type ProfileCtx } from "./context";

// ---------------------------------------------------------------- app config (read at app start)

const FLAGS: FeatureFlag[] = ["lawyer_notice", "file_with_us", "deal_from_chat"];

/**
 * Remote switches and the minimum app version. Flags default to OFF: a flag the
 * table doesn't have, or a failed read, means the feature stays hidden.
 */
export async function appConfig(): Promise<AppConfig> {
  const flags = Object.fromEntries(FLAGS.map((f) => [f, false])) as Record<FeatureFlag, boolean>;
  const min = { ios: "0.0.0", android: "0.0.0" };
  try {
    const db = createAdminClient();
    const [{ data: rows }, { data: v }] = await Promise.all([
      db.from("feature_flags").select("key, enabled"),
      db.from("app_settings").select("value").eq("key", "min_app_version").maybeSingle(),
    ]);
    for (const r of rows ?? []) if ((FLAGS as string[]).includes(r.key)) flags[r.key as FeatureFlag] = !!r.enabled;
    const mv = v?.value as Partial<typeof min> | undefined;
    if (mv?.ios) min.ios = mv.ios;
    if (mv?.android) min.android = mv.android;
  } catch (e) {
    console.error("app config read failed", e instanceof Error ? e.message : e);
  }
  // Phone OTP needs DLT-registered SMS; until it's live the apps offer email codes only.
  return { flags, minAppVersion: min, signIn: { phone: process.env.NEXT_PUBLIC_SMS_ENABLED !== "false", email: true }, support: await supportContact() };
}

/** Help & support contact (app_settings key "support": {email, whatsapp}). Null until one is set. */
async function supportContact(): Promise<AppConfig["support"]> {
  const s = await getSetting<{ email?: string; whatsapp?: string }>("support");
  const email = s?.email?.trim() || null;
  const whatsapp = s?.whatsapp?.replace(/[^\d+]/g, "") || null;
  return email || whatsapp ? { email, whatsapp } : null;
}

// ---------------------------------------------------------------- feedback

/** Signed-in creators write through RLS; feedback from sign-in/onboarding is anonymous. */
export async function submitFeedback(ctx: Ctx | null, input: { screen: string; message: string }): Promise<void> {
  const text = String(input.message ?? "").trim().slice(0, 4000);
  if (!text) fail(400, "Please write a message");
  const screen = String(input.screen ?? "").slice(0, 200);
  const client = ctx ? ctx.db : createAdminClient();
  const { error } = await client.from("feedback").insert({ user_id: ctx?.user.id ?? null, screen, message: text });
  if (error) fail(500, "Could not send feedback. Try again.");
  if (ctx) await track(ctx, "feedback_sent", { screen: screen.slice(0, 120) });
  else await trackEvent(null, "feedback_sent", { screen: screen.slice(0, 120) });
}

// ---------------------------------------------------------------- in-app notices

export async function listNotifications(ctx: ProfileCtx): Promise<{ id: string; title: string; link: string | null }[]> {
  const { data } = await ctx.db.from("notifications").select("id, title, link").is("read_at", null).order("created_at", { ascending: false }).limit(3);
  return data ?? [];
}

/** Creator dismisses an in-app notice (RLS: only their own). */
export async function dismissNotification(ctx: ProfileCtx, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await ctx.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

/** Web sign-out clears the session cookie; the mobile apps sign out with the Supabase client directly. */
export async function signOutWeb(): Promise<void> {
  const db = await createCookieClient();
  await db.auth.signOut();
}
