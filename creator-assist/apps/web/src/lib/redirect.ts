import type { NextRequest } from "next/server";

/** A redirect URL on the host the visitor used (the raw request URL can carry the server's bind address). */
export function sameHost(req: NextRequest, path: string): URL {
  const u = req.nextUrl.clone();
  const [p, q] = path.split("?");
  u.pathname = p;
  u.search = q ? `?${q}` : "";
  return u;
}
