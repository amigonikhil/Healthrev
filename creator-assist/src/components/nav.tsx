"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", label: "Home", d: "M4 10l8-6 8 6v10H4z" },
  { href: "/deals", label: "Deals", d: "M3 7h18v13H3zM9 7V5h6v2" },
  { href: "/brands", label: "Brands", d: "M4 20V8l8-4 8 4v12M9 20v-6h6v6" },
  { href: "/tax", label: "Tax", d: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/settings", label: "Settings", d: "M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4", cap: true },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap={t.cap ? "round" : undefined} width="22" height="22" aria-hidden>
              <path d={t.d} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
