"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setSampleData } from "@/app/actions/sample";
import { useToast } from "./client";

/** Bottom-left switch (opposite Feedback) so testers can load or clear the demo deals anywhere. */
export function SampleToggle({ on: initial }: { on: boolean }) {
  const [on, setOn] = useState(initial);
  useEffect(() => setOn(initial), [initial]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const flip = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      toast(await setSampleData(next));
      router.push("/home");
      router.refresh();
    });
  };
  return (
    <button type="button" role="switch" aria-checked={on} aria-busy={pending} disabled={pending} className="fab left" onClick={flip}>
      <span className={`mini-switch${on ? " on" : ""}`} aria-hidden />
      {pending ? (on ? "Loading…" : "Clearing…") : "Sample data"}
    </button>
  );
}
