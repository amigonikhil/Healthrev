// Masking for the admin dashboard: PAN, bank, GSTIN and brand contact details are
// never shown; phone numbers are masked unless an owner reveals them (logged).

/** +91 98•••••210 */
export function maskPhone(p: string | null | undefined): string {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length < 6) return d ? "•••" : "—";
  const cc = d.length > 10 ? `+${d.slice(0, d.length - 10)} ` : "";
  const n = d.slice(-10);
  return `${cc}${n.slice(0, 2)}${"•".repeat(5)}${n.slice(-3)}`;
}

/** r•••@gmail.com */
export function maskEmail(e: string | null | undefined): string {
  if (!e || !e.includes("@")) return "—";
  const [u, dom] = e.split("@");
  return `${u[0] ?? ""}•••@${dom}`;
}

/** ₹10k–50k style band, for totals outside a support ticket. */
export function amountBand(paise: number): string {
  const r = paise / 100;
  const bands: [number, string][] = [[0, "₹0"], [10_000, "under ₹10k"], [50_000, "₹10k–50k"], [1_00_000, "₹50k–1L"], [5_00_000, "₹1L–5L"], [Infinity, "over ₹5L"]];
  if (r <= 0) return "₹0";
  return bands.find(([max]) => r < max)![1];
}

/** Strip contact and financial identifiers from free text (notice drafts, notes). */
export function redact(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => maskEmail(m))
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "•••••••••")                    // PAN
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z0-9]{2}\b/g, "•••••••••••••••") // GSTIN
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "•••••••••••")                // IFSC
    .replace(/(Account No\.?:?\s*)\d+/gi, "$1••••")
    .replace(/\b\d{9,18}\b/g, (m) => `••••${m.slice(-4)}`)              // account / long numbers
    .replace(/(UPI:?\s*)\S+@\S+/gi, "$1••••")
    .replace(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g, (m) => maskPhone(m));
}
