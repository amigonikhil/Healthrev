import Link from "next/link";
import type { ReactNode } from "react";
import type { DealAmounts, Tone } from "@/lib/deal-view";
import { inr } from "@/lib/money";
import { BackButton } from "./client";
import { FeedbackButton } from "./feedback";

export function Top({ title, sub, back = true, fallback = "/home", right }: { title: string; sub?: string; back?: boolean; fallback?: string; right?: ReactNode }) {
  return (
    <div className="top">
      {back && <BackButton fallback={fallback} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
      <FeedbackButton />
    </div>
  );
}

export const Chip = ({ tone, children, style }: { tone: Tone; children: ReactNode; style?: React.CSSProperties }) => (
  <span className={`chip c-${tone}`} style={style}>{children}</span>
);

export function Row({ k, v, strong }: { k: ReactNode; v: ReactNode; strong?: boolean }) {
  return (
    <div className="row">
      {strong ? <span style={{ color: "var(--text)", fontWeight: 700 }}>{k}</span> : <span>{k}</span>}
      {typeof v === "string" || typeof v === "number" ? <b>{v}</b> : v}
    </div>
  );
}

/** Brand initials on a coloured tile; the colour is stable per name. */
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  return <span className={`av av-${hue}`} aria-hidden>{initials}</span>;
}

/** "₹X due" with "₹Y after TDS" in smaller text underneath. */
export function Amounts({ a }: { a: Pick<DealAmounts, "due" | "afterTds"> & { label?: DealAmounts["label"] } }) {
  return (
    <span className="amts">
      <span className="amt">{inr(a.due)} <span className="amt-l">{a.label ?? "due"}</span></span>
      <span className="amt-sub">{inr(a.afterTds)} after TDS</span>
    </span>
  );
}

export function Item({ href, title, sub, amount, chip, avatar }: { href: string; title: string; sub?: string; amount?: Parameters<typeof Amounts>[0]["a"]; chip?: { label: string; tone: Tone }; avatar?: string }) {
  return (
    <Link className="item" href={href}>
      {avatar && <Avatar name={avatar} />}
      <span className="l"><span className="t trunc">{title}</span>{sub && <span className="s">{sub}</span>}</span>
      <span className="r">
        {amount && <Amounts a={amount} />}
        {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
      </span>
    </Link>
  );
}

export function Done({ icon, tone = "ok", title, children }: { icon: string; tone?: "ok" | "info"; title: string; children: ReactNode }) {
  return (
    <div className="center">
      <div className={`badge ${tone}`} aria-hidden>{icon}</div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export const BetaNote = ({ children }: { children: ReactNode }) => <p className="beta">Beta: {children}</p>;

export function Doc({ body }: { body: { title: string; subtitle: string; clauses: [string, string][] } }) {
  return (
    <div className="card doc">
      <h2>{body.title}</h2>
      <p className="sub" style={{ fontFamily: "inherit" }}>{body.subtitle}</p>
      {body.clauses.map(([h, t]) => (
        <div key={h} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h3>{h}</h3>
          <p>{t}</p>
        </div>
      ))}
    </div>
  );
}

/** Header for a tab's main screen: title (and optional eyebrow) on the left, actions + feedback on the right. */
export function Head({ title, eyebrow, children }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <div className="top">
      <div style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && <p className="sub">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
      <FeedbackButton />
    </div>
  );
}
