"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" },
  { href: "/admin/creators", label: "Creators", icon: "M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1 .4-2 1.2-2.7A10 10 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z" },
  { href: "/admin/funnel", label: "Funnel", icon: "M3 4h18l-7 8v6l-4 2v-8z" },
  { href: "/admin/feedback", label: "Feedback", icon: "M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5 4V4a1 1 0 0 1 1-1z" },
  { href: "/admin/queues", label: "Queues", icon: "M4 5h16v3H4zm0 5.5h16v3H4zM4 16h16v3H4z" },
  { href: "/admin/activity", label: "Activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { href: "/admin/settings", label: "Settings", icon: "M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7 7 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7 7 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" },
];

/** Sidebar on desktop, scrollable bottom tabs on phones. Keeps the date range when switching pages. */
export function AdminNav({ queued, role }: { queued: number; role: string }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to", "sample", "admins"]) { const v = sp.get(k); if (v) keep.set(k, v); }
  const q = keep.toString() ? `?${keep}` : "";
  return (
    <nav className="ad-nav" aria-label="Admin">
      <div className="ad-brand">Creator Assist <small>admin · {role}</small></div>
      {ITEMS.map((it) => {
        const on = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href + q} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden><path d={it.icon} fill={it.label === "Activity" ? "none" : "currentColor"} stroke={it.label === "Activity" ? "currentColor" : undefined} strokeWidth={2} strokeLinejoin="round" /></svg>
            <span>{it.label}</span>
            {it.label === "Queues" && queued > 0 && <b className="ad-badge" aria-label={`${queued} new`}>{queued}</b>}
          </Link>
        );
      })}
      <Link href="/home" className="ad-exit">← Back to app</Link>
    </nav>
  );
}
