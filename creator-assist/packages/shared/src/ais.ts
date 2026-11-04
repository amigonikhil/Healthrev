// Best-effort reader for the AIS JSON downloaded from the income-tax portal.
// The format isn't documented publicly and changes, so this walks the whole
// document and picks out anything that looks like a TDS line: a deductor
// name and/or TAN plus a TDS amount. Unparseable files are still stored and
// the creator can add entries by hand.

const TAN = /\b([A-Z]{4}[0-9]{5}[A-Z])\b/;

export type AisLine = { deductor_name: string; tan: string | null; amount_paise: number };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseAis(json: unknown): AisLine[] {
  const found: AisLine[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    let name: string | null = null, tan: string | null = null, tds: number | null = null;
    for (const [k, v] of Object.entries(o)) {
      const key = k.toLowerCase();
      if (typeof v === "string" && /deductor.*name|name.*deductor|information source|^source$|payer.*name|deductorname/.test(key)) name = v.trim();
      if (typeof v === "string" && /(^|[^a-z])tan([^a-z]|$)|deductortan/.test(key) && TAN.test(v.toUpperCase())) tan = v.toUpperCase().match(TAN)![1];
      if (/tds.*deduct|tax.*deduct|deducted|tdsamount|tds_amount|^tds$/.test(key)) tds = num(v) ?? tds;
    }
    if (name && !tan && TAN.test(name)) tan = name.match(TAN)![1];
    if ((name || tan) && tds && tds > 0) {
      found.push({ deductor_name: (name ?? tan!).replace(/\s*\(([A-Z]{4}[0-9]{5}[A-Z])\)\s*/, "").trim() || tan!, tan, amount_paise: Math.round(tds * 100) });
      return; // don't double count nested copies of the same line
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  // Merge per deductor.
  const merged = new Map<string, AisLine>();
  for (const l of found) {
    const k = l.tan ?? l.deductor_name.toLowerCase();
    const m = merged.get(k);
    if (m) m.amount_paise += l.amount_paise;
    else merged.set(k, { ...l });
  }
  return [...merged.values()];
}
