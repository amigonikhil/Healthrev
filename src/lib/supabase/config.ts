// Public Supabase project connection values.
//
// The anon/publishable key is *designed* to be shipped to the browser — every
// request is still governed by Row-Level Security, so this is not a secret
// (unlike the service-role key, which must never appear in client code or the
// repo). Baking the public values in as defaults lets the app run on hosts
// where NEXT_PUBLIC_* env vars aren't configured. Env vars, when present, win —
// so pointing at a different project is just a matter of setting them.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://urhswqzlcdqdghufubrb.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_d7mhxGjnfOS8AsjNdHZdoQ_imMZa4Mn";
