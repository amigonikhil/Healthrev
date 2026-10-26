"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const id = (store: Storage, key: string) => {
  try {
    let v = store.getItem(key);
    if (!v) { v = crypto.randomUUID(); store.setItem(key, v); }
    return v;
  } catch { return "unknown"; }
};

/** Fire-and-forget product event (screen views, sign-in steps, WhatsApp clicks). */
export function trackClient(name: string, props: Record<string, string> = {}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ name, screen: location.pathname, anon: id(localStorage, "ca_anon"), props: { ...props, session: id(sessionStorage, "ca_session") } });
  try {
    if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
      fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch { /* tracking never breaks the app */ }
}

/** Logs a page_view per route (and signin_opened on the sign-in screen). Admin screens are not tracked. */
export function PageTracker() {
  const path = usePathname();
  useEffect(() => {
    if (path.startsWith("/admin")) return;
    trackClient("page_view");
    if (path === "/signin") trackClient("signin_opened");
  }, [path]);
  return null;
}
