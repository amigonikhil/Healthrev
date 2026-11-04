/**
 * fetch for the Supabase clients on the server. Next.js memoizes identical GET requests
 * during a render and may cache them; database reads must never be served from either,
 * or a read right after a write (e.g. load the profile just created) sees stale data.
 * A fresh AbortSignal opts out of memoization; no-store opts out of the data cache.
 */
export const dbFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });
