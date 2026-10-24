"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(screen: string, message: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = message.trim().slice(0, 4000);
  if (!text) return { ok: false, error: "Please write a message" };
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  // Signed-in testers write through RLS; sign-in/onboarding feedback is anonymous.
  const client = user ? db : createAdminClient();
  const { error } = await client.from("feedback").insert({ user_id: user?.id ?? null, screen: screen.slice(0, 200), message: text });
  return error ? { ok: false, error: "Could not send feedback. Try again." } : { ok: true };
}
