export function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  );
}

export function PhasePlaceholder({ phase, note }: { phase: number; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="text-xs font-medium uppercase tracking-wide text-brand">
        Phase {phase}
      </div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{note}</p>
    </div>
  );
}
