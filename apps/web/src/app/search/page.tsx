import { fromApi } from '@/lib/products';

interface Hit { product: string; type: string; refId: string; title: string; snippet: string | null }

/**
 * Federated search UI. One query, results from every product the workspace has
 * enabled, ranked together — the user does not need to know which product owns
 * the thing they are looking for.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  if (!q) return <p style={{ color: 'var(--helix-muted)' }}>Type a query above.</p>;

  const { data, problem } = await fromApi<{ data: Hit[] }>(
    `/v1/platform/search?q=${encodeURIComponent(q)}`,
  );
  const hits = data?.data ?? [];

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Results for &ldquo;{q}&rdquo;</h1>
      {problem && <p style={{ color: 'var(--helix-danger)' }}>{problem}</p>}
      {!problem && hits.length === 0 && (
        <p style={{ color: 'var(--helix-muted)' }}>Nothing matched across your enabled products.</p>
      )}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {hits.map((h) => (
          <li key={`${h.product}:${h.refId}`} style={{ padding: '12px 0', borderBottom: '1px solid var(--helix-border)' }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--helix-muted)' }}>
              {h.product}
            </span>
            <div style={{ fontWeight: 600 }}>{h.title}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
