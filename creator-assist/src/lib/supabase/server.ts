import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Per-request client acting as the signed-in user. RLS applies. */
export async function createClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list: CookieToSet[]) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Read-only in Server Components; middleware refreshes the session.
        }
      },
    },
  });
}

export type DB = Awaited<ReturnType<typeof createClient>>;
