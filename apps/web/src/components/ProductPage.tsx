import type { ReactNode } from 'react';

/**
 * The shared frame every product UI renders into. It is what makes 100 products
 * feel like one product rather than 100 apps sharing a domain — and it is the
 * component that becomes the micro-frontend host boundary later.
 */
export function ProductPage({
  title, subtitle, problem, children,
}: {
  title: string;
  subtitle: string;
  problem?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>{title}</h1>
      <p style={{ color: 'var(--helix-muted)', marginTop: 0, marginBottom: 24 }}>{subtitle}</p>
      {problem ? (
        <div style={{
          border: '1px solid var(--helix-border)', borderLeft: '3px solid var(--helix-danger)',
          borderRadius: 8, padding: '12px 16px', color: 'var(--helix-muted)',
        }}>
          {problem}
        </div>
      ) : children}
    </>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p style={{ color: 'var(--helix-muted)' }}>{children}</p>;
}

export function Row({ title, meta }: { title: string; meta: string }) {
  return (
    <li style={{ padding: '11px 0', borderBottom: '1px solid var(--helix-border)' }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ color: 'var(--helix-muted)', fontSize: 12 }}>{meta}</div>
    </li>
  );
}
