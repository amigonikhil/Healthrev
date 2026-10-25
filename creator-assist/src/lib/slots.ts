import { addDays, nineAmIST } from "./dates";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Four call slots on upcoming working days (not Sunday), alternating morning and evening (IST). */
export function callSlots(today: string, startInDays: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const times: [number, number][] = [[11, 0], [18, 30], [10, 0], [19, 0]];
  let day = startInDays, i = 0;
  while (out.length < 4) {
    const d = addDays(today, day);
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd !== 0) {
      const [h, m] = times[i % times.length];
      const at = new Date(Date.parse(nineAmIST(d)) + ((h - 9) * 60 + m) * 60_000).toISOString();
      const x = new Date(d + "T00:00:00Z");
      out.push({ value: at, label: `${DAY[wd]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` });
      if (i % 2 === 1) day++;
      i++;
    } else day++;
  }
  return out;
}

export const fmtSlot = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
