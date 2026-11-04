// Money is always integer paise. Formatting uses the Indian grouping (₹1,00,300).

export const rupees = (r: number) => Math.round(r * 100);

export function inr(paise: number, opts: { paise?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const r = opts.paise ? abs / 100 : Math.round(abs / 100);
  const s = r.toLocaleString("en-IN", {
    minimumFractionDigits: opts.paise && abs % 100 ? 2 : 0,
    maximumFractionDigits: opts.paise ? 2 : 0,
  });
  return (neg ? "− " : "") + "₹" + s;
}

/** "− ₹15,000" for deductions in summaries. */
export const minus = (paise: number) => "− " + inr(paise);

/** Parse a user-typed rupee amount ("45,000", "45000.50") into paise. NaN on junk. */
export function parseRupees(input: string | null | undefined): number {
  if (input == null) return NaN;
  const clean = String(input).replace(/[₹,\s]/g, "");
  if (clean === "" || !/^\d+(\.\d{0,2})?$/.test(clean)) return NaN;
  return Math.round(parseFloat(clean) * 100);
}

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? ONES[h] + " hundred" : "", rest ? twoDigits(rest) : ""].filter(Boolean).join(" ");
}

/** "Rupees fifty-three thousand one hundred only" (Indian system: lakh, crore). */
export function amountInWords(paise: number): string {
  let n = Math.floor(Math.abs(paise) / 100);
  const p = Math.abs(paise) % 100;
  if (n === 0 && p === 0) return "Rupees zero only";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(threeDigits(crore) + " crore");
  if (lakh) parts.push(twoDigits(lakh) + " lakh");
  if (thousand) parts.push(twoDigits(thousand) + " thousand");
  if (n) parts.push(threeDigits(n));
  let s = "Rupees " + (parts.join(" ") || "zero");
  if (p) s += " and " + twoDigits(p) + " paise";
  return s + " only";
}
