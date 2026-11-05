import "server-only";
import type { PushKind, Profile } from "@creator-assist/shared/types";
import { createAdminClient } from "./supabase/admin";

// Push notifications through the Expo push service (free), which delivers to APNs and FCM.
// Messages carry a title, a one-line body and the in-app path to open: never PAN, bank
// details or OTPs. Each (creator, kind, ref) is sent at most once (push_log), sample deals
// never notify, and nothing is sent at night (21:00–09:00 IST).

const EXPO_URL = () => process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send";

export type PushMessage = { title: string; body: string; url: string; ref: string };
export type PushResult = { sent: number; skipped?: "prefs" | "duplicate" | "no_tokens" | "quiet_hours" };

/** 09:00–21:00 IST, unless PUSH_ANY_HOUR is set (tests). */
export function pushHours(now = new Date()): boolean {
  if (process.env.PUSH_ANY_HOUR === "1") return true;
  const h = Math.floor(((now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440) / 60); // IST = UTC+5:30
  return h >= 9 && h < 21;
}

export const wantsPush = (prefs: Profile["push_prefs"] | null | undefined, kind: PushKind) => prefs?.[kind] !== false;

/**
 * Sends one notification to all of a creator's devices. Respects their switches and quiet
 * hours (unless `urgent`, for things they just caused to happen, like a signature), and
 * records it so the same event never notifies twice.
 */
export async function sendPush(userId: string, kind: PushKind, m: PushMessage, opts: { prefs?: Profile["push_prefs"]; urgent?: boolean } = {}): Promise<PushResult> {
  const db = createAdminClient();
  try {
    if (!opts.urgent && !pushHours()) return { sent: 0, skipped: "quiet_hours" };
    let prefs = opts.prefs;
    if (prefs === undefined) {
      const { data } = await db.from("profiles").select("push_prefs").eq("id", userId).maybeSingle();
      prefs = (data?.push_prefs ?? {}) as Profile["push_prefs"];
    }
    if (!wantsPush(prefs, kind)) return { sent: 0, skipped: "prefs" };
    const { data: tokens } = await db.from("push_tokens").select("token").eq("user_id", userId);
    if (!tokens?.length) return { sent: 0, skipped: "no_tokens" };

    // Claim the event first: a second run (or a concurrent one) finds the row and stops.
    const { error: dup } = await db.from("push_log").insert({ user_id: userId, kind, ref: m.ref });
    if (dup) return { sent: 0, skipped: "duplicate" };

    const messages = tokens.map((t) => ({
      to: t.token, title: m.title, body: m.body, sound: "default", priority: "high", channelId: "default",
      data: { url: m.url, kind },
    }));
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const res = await fetch(EXPO_URL(), { method: "POST", headers, body: JSON.stringify(messages), cache: "no-store" });
    const out = (await res.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
    // Forget devices the push service no longer knows (app deleted, token rotated).
    const gone = (out?.data ?? []).map((r, i) => (r.status === "error" && r.details?.error === "DeviceNotRegistered" ? tokens[i].token : null)).filter(Boolean) as string[];
    if (gone.length) await db.from("push_tokens").delete().in("token", gone);
    return { sent: res.ok ? messages.length - gone.length : 0 };
  } catch (e) {
    console.error("push failed", kind, e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}
