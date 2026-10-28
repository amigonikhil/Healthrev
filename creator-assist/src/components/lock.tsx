/** Small lock with "Encrypted", shown next to PAN and bank account fields. */
/** `inLabel`: inside a form label, so the field keeps its plain name ("PAN") for screen readers. */
export function Lock({ label = true, inLabel = false }: { label?: boolean; inLabel?: boolean }) {
  return (
    <span className="lock" title="Encrypted before it's saved" aria-hidden={inLabel || undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      {label && "Encrypted"}
    </span>
  );
}
