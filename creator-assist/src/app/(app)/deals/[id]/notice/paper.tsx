import { ADVOCATE } from "@/lib/advocate";
import type { Notice, Para } from "@/lib/notice";

// On-screen copy of the notice PDF (same letterhead and layout), since phones
// can't show a PDF inline.
function rich(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part, i) => (part.startsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part));
}
function P({ x }: { x: Para }) {
  if (typeof x === "string") return <p>{rich(x)}</p>;
  const L = x.ordered ? "ol" : "ul";
  return <L>{x.list.map((l, i) => <li key={i}>{rich(l)}</li>)}</L>;
}
const Lines = ({ lines }: { lines: string[] }) => <p>{lines.map((l, i) => <span key={i}>{l}<br /></span>)}</p>;

export function NoticePaper({ n }: { n: Notice }) {
  return (
    <article className="paper" aria-label="Legal notice preview">
      <header className="lh">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/notice/scales.png" alt="" />
        <div className="lh-box">
          <strong>{ADVOCATE.firm.toUpperCase()}</strong>
          <u>{ADVOCATE.tagline}</u>
          <span>{ADVOCATE.courts.join(" ")}</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/notice/bands.png" alt="" />
      </header>
      <p className="r">Date: {n.date.split("-").reverse().join("/")}</p>
      <p className="c"><b>BY REGISTERED POST / SPEED POST / EMAIL</b></p>
      <Lines lines={["TO", ...n.to]} />
      {n.alsoTo && <Lines lines={["ALSO TO", ...n.alsoTo]} />}
      <p><b>SUBJECT: {n.subject}</b></p>
      <Lines lines={["On behalf of:", ...n.onBehalf]} />
      <p>Sir/Madam,</p>
      {n.intro.map((x, i) => <P key={i} x={x} />)}
      {n.sections.map((s, i) => (
        <section key={s.title}><h4>{i + 1}. {s.title}</h4>{s.body.map((x, j) => <P key={j} x={x} />)}</section>
      ))}
      <h4>CONCLUSION</h4>
      {n.conclusion.map((x, i) => <P key={i} x={x} />)}
      <p>{n.withoutPrejudice}</p>
      <p>Yours faithfully,</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sig" src="/notice/signature.png" alt={`Signature of ${ADVOCATE.name}`} />
      <Lines lines={[`${ADVOCATE.name}, Advocate`, ADVOCATE.firm, ADVOCATE.address, `Email : ${ADVOCATE.email}`, `Contact No : ${ADVOCATE.phones}`]} />
      <p><b>Authorised Representative for {n.representing}</b></p>
    </article>
  );
}
