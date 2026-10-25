"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setAdminStatus } from "@/app/actions/admin";
import { useToast } from "@/components/client";

type Table = Parameters<typeof setAdminStatus>[0];

/** Row of status buttons; the current status is shown as pressed. */
export function StatusButtons({ table, id, current, options }: { table: Table; id: string; current: string; options: { value: string; label: string }[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <div className="seg" role="radiogroup" aria-label="Status">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === current} className={o.value === current ? "on" : ""} disabled={pending || o.value === current}
          onClick={() => start(async () => { const r = await setAdminStatus(table, id, o.value); toast(r.message); if (r.ok) router.refresh(); })}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
