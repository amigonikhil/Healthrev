import { Row, Top } from "@/components/ui";
import { loadViews } from "@/lib/data";
import { callSlots } from "@/lib/slots";
import { taxHub } from "@/lib/tax";
import { BookingForm } from "./form";

export const metadata = { title: "File with us · Creator Assist" };

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
          ].map((t) => <li key={t}><span className="dot" style={{ background: "var(--accent)" }} /><span>{t}</span></li>)}
        </ol>
      </div>
      <div className="card">
        <Row k="Return type" v="ITR-4 (presumptive)" />
        <Row k="Data ready" v={`${hub.invoiceCount} invoice${hub.invoiceCount === 1 ? "" : "s"} · ${hub.brands} brand${hub.brands === 1 ? "" : "s"}`} />
        <Row k="Fee" v="₹1,999" />
      </div>
      <h2>Book your AI call</h2>
      <BookingForm slots={callSlots(today, 3)} phone={profile.phone ?? ""} lang={profile.language === "te" ? "Telugu" : profile.language === "hi" ? "Hindi" : "English"} />
    </main>
  );
}
