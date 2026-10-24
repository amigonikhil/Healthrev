import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../env";

/**
 * Service-role client. Bypasses RLS, so only use it where there is no user
 * session by design: the public signing page (looked up by token), the cron
 * job, the read-receipt pixel, the feedback admin page and account deletion.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
