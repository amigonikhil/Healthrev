import { useEffect, useState } from "react";
import { markPushOffered, shouldOfferPush, turnOnPush } from "@/lib/push";
import { useTheme } from "@/theme";
import { Button, Sheet, Txt, useToast } from "@/ui";

let request: (() => void) | null = null;
/** Called after a deal is created; shows the offer once, only if the phone hasn't been asked. */
export async function offerPushAfterDeal() {
  if (await shouldOfferPush()) request?.();
}

/** "Get a nudge when…" sheet shown before the OS permission prompt (mounted once, in the app stack). */
export function PushOffer() {
  const { c } = useTheme();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { request = () => setOpen(true); return () => { request = null; }; }, []);
  const close = () => { void markPushOffered(); setOpen(false); };
  return (
    <Sheet open={open} onClose={close} title="Get paid on time, with a nudge">
      <Txt color={c.muted}>We&apos;ll tell you when a payment is due or overdue, when a brand signs, when it&apos;s time to send a WhatsApp reminder, and before tax dates. You can change these in Settings.</Txt>
      <Button title="Turn on notifications" busy={busy} onPress={async () => {
        setBusy(true);
        const s = await turnOnPush().catch(() => "off" as const);
        setBusy(false); setOpen(false);
        if (s === "on") toast("Notifications are on");
        else if (s === "denied") toast("Notifications are off. You can turn them on in Settings.");
      }} />
      <Button title="Not now" kind="secondary" onPress={close} />
    </Sheet>
  );
}
