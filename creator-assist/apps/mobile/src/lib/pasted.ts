import type { PastedDeal } from "@creator-assist/shared/pasted-deal";

// Hand-off from Paste a chat to the New deal form: read once, then forgotten. Kept in memory
// only; the chat itself is never stored.
let pasted: PastedDeal | null = null;
export const setPasted = (d: PastedDeal | null) => { pasted = d; };
export const takePasted = (): PastedDeal | null => { const d = pasted; pasted = null; return d; };
