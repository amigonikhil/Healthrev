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

/** Brand initials on a coloured tile; the colour is stable per name. */
export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w[0] ?? "")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  return <span className={`av av-${hue}`} aria-hidden>{initials}</span>;
}

export function Item({ href, title, sub, amount, chip, avatar }: { href: string; title: string; sub?: string; amount?: string; chip?: { label: string; tone: Tone }; avatar?: string }) {
  return (
    <Link className="item" href={href}>
      {avatar && <Avatar name={avatar} />}
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
