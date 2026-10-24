import { Row, Top } from "@/components/ui";
import { addDays, nineAmIST } from "@/lib/dates";
import { loadViews } from "@/lib/data";
import { taxHub } from "@/lib/tax";
import { BookingForm } from "./form";

export const metadata = { title: "File with us · Creator Assist" };

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Four call slots over the next working days, alternating morning and evening (IST). */
function slots(today: string) {
  const out: { value: string; label: string }[] = [];
  const times: [number, number][] = [[11, 0], [18, 30], [10, 0], [19, 0]];
  let day = 3, i = 0;
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

export default async function FileWithUs() {
  const { db, views, today, profile } = await loadViews();
  const { data: ais } = await db.from("ais_entries").select("*");
  const hub = taxHub(views, ais ?? [], today);
  return (
    <main className="scr">
      <Top title="File with us" fallback="/tax" />
      <div className="card">
        <h2>How it works</h2>
        <ol className="tl">
          {[
            "We prepare your return from your invoices, payments, TDS and AIS already in the app.",
            "A 10-minute AI call asks about other income: salary, interest, rent, capital gains, deductions.",
            "A registered CA reviews and files your ITR.",
            "You e-verify with Aadhaar OTP in the app. Done.",
          ].map((t) => <li key={t}><span className="dot" style={{ background: "var(--acc)" }} /><span>{t}</span></li>)}
        </ol>
      </div>
      <div className="card">
        <Row k="Return type" v="ITR-4 (presumptive)" />
        <Row k="Data ready" v={`${hub.invoiceCount} invoice${hub.invoiceCount === 1 ? "" : "s"} · ${hub.brands} brand${hub.brands === 1 ? "" : "s"}`} />
        <Row k="Fee" v="₹1,999" />
      </div>
      <h2>Book your AI call</h2>
      <BookingForm slots={slots(today)} phone={profile.phone ?? ""} lang={profile.language === "te" ? "Telugu" : profile.language === "hi" ? "Hindi" : "English"} />
    </main>
  );
}
