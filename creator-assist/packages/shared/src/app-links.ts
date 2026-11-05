// Maps an incoming URL to an app route. Handles creatorassist:// links
// (creatorassist://deal/<id>), https links to the web app (universal links / App Links use the
// same paths as the web) and the share-sheet hand-off. Pure, so it's easy to test.

/** Web paths the app has screens for; anything else opens Home. */
const APP_ROUTES = [/^\/deals(\/.*)?$/, /^\/brands$/, /^\/tax(\/.*)?$/, /^\/settings(\/.*)?$/];

export function routeForUrl(url: string, opts: { scheme: string; shareKey?: string }): string {
  if (opts.shareKey && url.includes(`dataUrl=${opts.shareKey}`)) return "/deals/paste?shared=1";
  let path: string;
  if (/^https?:\/\//i.test(url)) {
    try { const u = new URL(url); path = u.pathname + u.search; } catch { return "/"; }
  } else if (url.toLowerCase().startsWith(`${opts.scheme}://`)) {
    path = "/" + url.slice(opts.scheme.length + 3).replace(/^\/+/, "");
  } else {
    path = url.startsWith("/") ? url : "/" + url;
  }
  path = path.replace(/\/+$/, "") || "/";
  // creatorassist://deal/<id>[/…] is the short form of /deals/<id>.
  path = path.replace(/^\/deal\//, "/deals/");
  if (path === "/home" || path === "/") return "/";
  return APP_ROUTES.some((r) => r.test(path.split("?")[0])) ? path : "/";
}
