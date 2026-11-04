import Link from "next/link";

// Server-rendered SVG charts for the admin dashboard. Series colours are the
// validated pair (--chart-1 / --chart-2); text stays in text tokens; native
// <title> tooltips give per-point hover; every chart has a table fallback via its list link.

export function LineChart({ days, series, height = 180 }: { days: string[]; series: { label: string; color: string; values: number[] }[]; height?: number }) {
  const W = 640, H = height, pl = 30, pr = 12, pt = 10, pb = 22;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => pl + (days.length <= 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (days.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const every = Math.max(1, Math.ceil(days.length / 6));
  return (
    <figure className="ad-chart">
      <div className="ad-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={series.map((s) => `${s.label}: ${s.values.reduce((a, b) => a + b, 0)} total`).join(", ")}>
        {ticks.map((t) => (
          <g key={t}><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} className="ad-grid" /><text x={pl - 6} y={y(t) + 4} textAnchor="end" className="ad-axis">{t}</text></g>
        ))}
        {days.map((d, i) => i % every === 0 && <text key={d} x={x(i)} y={H - 6} textAnchor="middle" className="ad-axis">{d.slice(8)}/{d.slice(5, 7)}</text>)}
        {series.map((s) => (
          <g key={s.label}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={days.length > 45 ? 0 : 3} fill={s.color} stroke="var(--surface)" strokeWidth={2}>
                <title>{`${days[i]} · ${s.label}: ${v}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {/* wide invisible hit targets per day for the hover tooltip */}
        {days.map((d, i) => (
          <rect key={d} x={x(i) - (W - pl - pr) / Math.max(1, days.length) / 2} y={pt} width={(W - pl - pr) / Math.max(1, days.length)} height={H - pt - pb} fill="transparent">
            <title>{`${d}\n${series.map((s) => `${s.label}: ${s.values[i]}`).join("\n")}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}

/** Horizontal bars, each a link to the list behind it. */
export function Bars({ items, unit = "" }: { items: { label: string; value: number; href?: string }[]; unit?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="ad-bars">
      {items.map((it) => {
        const row = (<>
          <span className="ad-bar-label">{it.label}</span>
          <span className="ad-bar-track">{it.value > 0 && <span className="ad-bar-fill" style={{ width: `${(it.value / max) * 100}%` }} />}</span>
          <span className="ad-bar-value">{it.value}{unit}</span>
        </>);
        return it.href ? <Link key={it.label} href={it.href} className="ad-bar" title={`${it.label}: ${it.value}${unit}`}>{row}</Link> : <div key={it.label} className="ad-bar" title={`${it.label}: ${it.value}${unit}`}>{row}</div>;
      })}
    </div>
  );
}

/** Funnel: count reached per step and % lost from the previous step. */
export function Funnel({ steps }: { steps: { label: string; value: number; href?: string; note?: string }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1, ...steps.map((s) => s.value));
  return (
    <ol className="ad-funnel">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1].value : null;
        const lost = prev ? Math.max(0, Math.round(((prev - s.value) / prev) * 100)) : null;
        const body = (<>
          <span className="ad-bar-label"><b>{i + 1}.</b> {s.label}{s.note && <em> · {s.note}</em>}</span>
          <span className="ad-bar-track">{s.value > 0 && <span className="ad-bar-fill" style={{ width: `${(s.value / top) * 100}%` }} />}</span>
          <span className="ad-bar-value">{s.value}</span>
          <span className={`ad-lost${lost && lost >= 50 ? " hi" : ""}`}>{lost === null ? "" : `−${lost}%`}</span>
        </>);
        return <li key={s.label}>{s.href ? <Link href={s.href} className="ad-bar">{body}</Link> : <div className="ad-bar">{body}</div>}</li>;
      })}
    </ol>
  );
}
