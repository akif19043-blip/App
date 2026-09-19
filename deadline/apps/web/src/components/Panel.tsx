export function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`dl-panel dl-cut ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          {title && <h2 className="dl-heading text-sm text-muted">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.25em] text-muted">{label}</div>
      <div className={`dl-heading text-2xl ${tone ?? 'text-ink'}`}>{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-dashed border-edge px-4 py-10 text-center text-sm text-muted">
      {children}
    </div>
  );
}
