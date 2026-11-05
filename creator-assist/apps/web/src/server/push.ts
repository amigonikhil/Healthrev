import "server-only";
import { PUSH_KINDS, type Profile, type PushKind } from "@creator-assist/shared/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, type ProfileCtx } from "./context";

const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

/** Saves this device's Expo push token for the signed-in creator (a token moves with the account that last registered it). */
export async function registerPushToken(ctx: ProfileCtx, input: { token: string; platform: string }): Promise<void> {
  const token = String(input.token ?? "").trim();
  if (!TOKEN_RE.test(token)) fail(400, "That doesn't look like a push token");
  const platform = input.platform === "ios" || input.platform === "android" ? input.platform : ctx.platform;
  if (platform !== "ios" && platform !== "android") fail(400, "Push is for the iOS and Android apps");
  // RLS only lets a creator touch their own rows, so clear any old owner of this device first.
  await createAdminClient().from("push_tokens").delete().eq("token", token).neq("user_id", ctx.user.id);
  const { error } = await ctx.db.from("push_tokens").upsert(
    { user_id: ctx.user.id, token, platform, last_seen_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  if (error) fail(500, "Could not save this device: " + error.message);
}

/** Removes a device (sign-out, or notifications switched off). */
export async function removePushToken(ctx: ProfileCtx, token: string): Promise<void> {
  await ctx.db.from("push_tokens").delete().eq("token", String(token ?? "")).eq("user_id", ctx.user.id);
}

/** Which notifications the creator wants. Unknown keys are ignored. */
export async function savePushPrefs(ctx: ProfileCtx, prefs: Partial<Record<PushKind, boolean>>): Promise<Profile["push_prefs"]> {
  const clean = Object.fromEntries(PUSH_KINDS.map(({ kind }) => [kind, prefs?.[kind] !== false])) as Profile["push_prefs"];
  const { error } = await ctx.db.from("profiles").update({ push_prefs: clean }).eq("id", ctx.user.id);
  if (error) fail(500, "Could not save: " + error.message);
  return clean;
}
