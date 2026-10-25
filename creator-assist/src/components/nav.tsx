"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Filled glyphs (24×24), drawn with even-odd so the details read as cut-outs.
const TABS = [
  { href: "/home", label: "Home", d: "M12 2.5 22 11h-3v10h-5v-6h-4v6H5V11H2z" },
  { href: "/deals", label: "Deals", d: "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM8 12v2h8v-2zm0 4v2h8v-2z" },
  { href: "/brands", label: "Brands", d: "M2 3.5A1.5 1.5 0 0 1 3.5 2H12l10 10-10 10L2 12zM7.5 5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" },
  { href: "/tax", label: "Tax", d: "M5 2h14v20l-2.33-1.5L14.33 22 12 20.5 9.67 22l-2.34-1.5L5 22zm3 5v2h8V7zm0 4v2h8v-2zm0 4v2h5v-2z" },
  { href: "/settings", label: "Settings", d: "M3 5h9v2H3zm15 0h3v2h-3zM12 3h5v6h-5zM3 11h3v2H3zm10 0h8v2h-8zM6 9h6v6H6zM3 17h11v2H3zm17 0h1v2h-1zM14 15h5v6h-5z" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden>
              <path d={t.d} fillRule="evenodd" />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
