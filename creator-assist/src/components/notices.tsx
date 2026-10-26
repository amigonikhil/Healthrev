"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissNotification } from "@/app/actions/notifications";

/** Updates from the Creator Assist team (e.g. a request's status changed). */
export function Notices({ items }: { items: { id: string; title: string; link: string | null }[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const [, start] = useTransition();
  const shown = items.filter((n) => !gone.includes(n.id));
  if (!shown.length) return null;
  return (
    <div className="notices" role="status">
      {shown.map((n) => (
        <div className="notice" key={n.id}>
          <span>{n.link ? <Link href={n.link}>{n.title}</Link> : n.title}</span>
          <button type="button" aria-label="Dismiss" onClick={() => { setGone((g) => [...g, n.id]); start(() => dismissNotification(n.id)); }}>×</button>
        </div>
      ))}
    </div>
  );
}
