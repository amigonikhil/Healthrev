"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  phase?: number; // phase in which the feature lands (placeholder marker)
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases", label: "Cases", phase: 2 },
  { href: "/payouts", label: "Payouts", adminOnly: true, phase: 3 },
  { href: "/billing", label: "Billing", adminOnly: true, phase: 4 },
  { href: "/staff", label: "Staff", adminOnly: true },
  { href: "/settings", label: "Settings", adminOnly: true, phase: 3 },
];

export function NavSidebar({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.adminOnly || role === "admin");

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-brand text-brand-fg"
                : "text-foreground hover:bg-border/50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
