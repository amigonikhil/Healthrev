import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/deal-view";
import { BackButton } from "./client";

export function Top({ title, sub, back = true, fallback = "/home", right }: { title: string; sub?: string; back?: boolean; fallback?: string; right?: ReactNode }) {
  return (
    <div className="top" style={right ? { justifyContent: "space-between" } : undefined}>
      {back && <BackButton fallback={fallback} />}
      <div style={{ minWidth: 0, flex: right ? undefined : 1 }}>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
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

export function Item({ href, title, sub, amount, chip }: { href: string; title: string; sub?: string; amount?: string; chip?: { label: string; tone: Tone } }) {
  return (
    <Link className="item" href={href}>
      <span className="l"><span className="t trunc">{title}</span>{sub && <span className="s">{sub}</span>}</span>
      <span className="r">
        {amount && <span className="amt">{amount}</span>}
        {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
      </span>
    </Link>
  );
}

export function Done({ icon, tone = "ok", title, children }: { icon: string; tone?: "ok" | "info"; title: string; children: ReactNode }) {
  return (
    <div className="center">
      <div className="badge" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone})` }} aria-hidden>{icon}</div>
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
