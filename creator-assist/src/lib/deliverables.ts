// The deliverables menu. `weight` only splits the fee across invoice lines
// (a Reel is weighted like six Stories); it is not a price. Weight 0 = "Included".

export type DeliverableDef = { platform: string; type: string; label: string; weight: number; defaultQty: number; unit?: string };

export const DELIVERABLE_GROUPS: { group: string; items: DeliverableDef[] }[] = [
  {
    group: "Instagram",
    items: [
      { platform: "Instagram", type: "Reel", label: "Reel", weight: 6, defaultQty: 1 },
      { platform: "Instagram", type: "Story", label: "Story", weight: 1, defaultQty: 1 },
      { platform: "Instagram", type: "Static post", label: "Static post", weight: 3, defaultQty: 1 },
      { platform: "Instagram", type: "Carousel", label: "Carousel", weight: 3, defaultQty: 1 },
      { platform: "Instagram", type: "Collab post", label: "Collab post", weight: 6, defaultQty: 1 },
      { platform: "Instagram", type: "Live session", label: "Live session", weight: 4, defaultQty: 1 },
    ],
  },
  {
    group: "YouTube",
    items: [
      { platform: "YouTube", type: "Dedicated video", label: "Dedicated video", weight: 12, defaultQty: 1 },
      { platform: "YouTube", type: "Integration", label: "Integration (60–90 sec)", weight: 8, defaultQty: 1 },
      { platform: "YouTube", type: "Short", label: "Short", weight: 3, defaultQty: 1 },
      { platform: "YouTube", type: "Community post", label: "Community post", weight: 1, defaultQty: 1 },
      { platform: "YouTube", type: "Live stream", label: "Live stream", weight: 8, defaultQty: 1 },
    ],
  },
  {
    group: "Other platforms",
    items: [
      { platform: "Facebook", type: "Reel", label: "Facebook Reel", weight: 3, defaultQty: 1 },
      { platform: "LinkedIn", type: "Post", label: "LinkedIn post", weight: 2, defaultQty: 1 },
      { platform: "X", type: "Post", label: "X (Twitter) post", weight: 1, defaultQty: 1 },
      { platform: "Snapchat", type: "Story", label: "Snapchat Story", weight: 1, defaultQty: 1 },
      { platform: "Moj / Josh", type: "Video", label: "Moj / Josh video", weight: 3, defaultQty: 1 },
    ],
  },
  {
    group: "Add-ons",
    items: [
      { platform: "Add-on", type: "Link in bio", label: "Link in bio (days)", weight: 0, defaultQty: 7, unit: "days" },
      { platform: "Add-on", type: "Pinned comment", label: "Pinned comment", weight: 0, defaultQty: 1 },
      { platform: "Add-on", type: "Raw footage", label: "Raw footage", weight: 2, defaultQty: 1 },
      { platform: "Add-on", type: "Event appearance", label: "Event appearance", weight: 10, defaultQty: 1 },
    ],
  },
];

export const ALL_DELIVERABLES = DELIVERABLE_GROUPS.flatMap((g) => g.items);
export const deliverableKey = (d: { platform: string; type: string }) => `${d.platform}|${d.type}`;
export const findDeliverable = (platform: string, type: string) =>
  ALL_DELIVERABLES.find((d) => d.platform === platform && d.type === type);

const PLURAL: Record<string, string> = { Story: "Stories", "Link in bio": "Link in bio", "Raw footage": "Raw footage" };

function noun(type: string, qty: number): string {
  if (qty === 1) return type;
  return PLURAL[type] ?? (type.endsWith("y") ? type.slice(0, -1) + "ies" : type + "s");
}

export type Deliverable = { platform: string; type: string; quantity: number };

/** Short name for lists: "Reel", "Facebook Reel", "YouTube Short". */
function shortName(d: Deliverable, qty: number): string {
  const n = noun(d.type, qty);
  if (d.platform === "Instagram" || d.platform === "Add-on") return n;
  return `${d.platform} ${n}`;
}

/** "2 Reels · 3 Stories" (sep configurable). Link in bio shows days. */
export function deliverablesSummary(items: Deliverable[], sep = " · "): string {
  if (!items.length) return "No deliverables";
  return items
    .map((d) => (d.type === "Link in bio" ? `Link in bio ${d.quantity} days` : `${d.quantity} ${shortName(d, d.quantity)}`))
    .join(sep);
}

/** Agreement prose: "2 Instagram Reels and 3 Instagram Stories". */
export function deliverablesProse(items: Deliverable[]): string {
  const parts = items.map((d) => {
    if (d.type === "Link in bio") return `a link in bio for ${d.quantity} days`;
    if (d.platform === "Add-on") return `${d.quantity} ${noun(d.type, d.quantity).toLowerCase()}`;
    return `${d.quantity} ${d.platform} ${noun(d.type, d.quantity)}`;
  });
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

/** Invoice line label: "Instagram Reel × 2". */
export function invoiceLineLabel(d: Deliverable): string {
  const name = d.platform === "Add-on" ? d.type : `${d.platform} ${d.type}`;
  return d.type === "Link in bio" ? `Link in bio, ${d.quantity} days` : `${name} × ${d.quantity}`;
}

export const USAGE_DURATIONS: { value: string; label: string; prose: string }[] = [
  { value: "1m", label: "1 month", prose: "1 month" },
  { value: "3m", label: "3 months", prose: "3 months" },
  { value: "6m", label: "6 months", prose: "6 months" },
  { value: "12m", label: "12 months", prose: "12 months" },
  { value: "perpetual", label: "Perpetual", prose: "perpetuity" },
];
export const USAGE_SCOPES: { value: string; label: string; prose: string }[] = [
  { value: "organic_paid", label: "Organic reshare + paid ads", prose: "including organic reshares and paid ads" },
  { value: "organic", label: "Organic reshare only", prose: "for organic reshares only" },
  { value: "paid", label: "Paid ads / whitelisting only", prose: "for paid ads and whitelisting only" },
];
export const usageDurationLabel = (v: string | null | undefined) => USAGE_DURATIONS.find((d) => d.value === v)?.label ?? "";
