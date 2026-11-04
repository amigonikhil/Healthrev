import { usePathname } from "expo-router";
import { useEffect } from "react";
import { trackEvent } from "./api";

/** Native routes → the matching web path, so screen names line up in the admin funnel. */
export function webPath(path: string): string {
  if (path === "/" || path === "") return "/home";
  if (path === "/sign-in") return "/signin";
  if (path === "/setup") return "/onboarding";
  return path;
}

/** Logs a page_view per screen (and signin_opened on sign-in), like the web's PageTracker. */
export function PageTracker() {
  const path = webPath(usePathname());
  useEffect(() => {
    trackEvent("page_view", path);
    if (path === "/signin") trackEvent("signin_opened", path);
  }, [path]);
  return null;
}
