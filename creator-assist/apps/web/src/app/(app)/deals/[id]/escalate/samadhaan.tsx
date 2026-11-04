"use client";

import { startSamadhaan } from "@/app/actions/escalations";
import { Chip } from "@/components/ui";
import { useToast } from "@/components/client";

export function SamadhaanItem({ dealId }: { dealId: string }) {
  const toast = useToast();
  return (
    <a
      className="item" href="https://samadhaan.msme.gov.in/" target="_blank" rel="noopener"
      onClick={() => { startSamadhaan(dealId); toast("Opening MSME Samadhaan. Beta: we've noted it, you file on the portal yourself."); }}
    >
      <span className="l"><span className="t">3 · MSME Samadhaan</span><span className="s">File a delayed-payment case online</span></span>
      <Chip tone="mute">Govt portal</Chip>
    </a>
  );
}
