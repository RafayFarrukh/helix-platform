/**
 * Federated search UI. One query, results from every product the workspace has
 * enabled, ranked together — the user does not need to know which product owns
 * what they are looking for.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  if (!q) return <p style={{ color: 'var(--helix-muted)' }}>Type a query above.</p>;

  const res = await fetch(
    `${process.env.INTERNAL_API_URL ?? 'http://localhost:4100'}/v1/platform/search?q=${encodeURIComponent(q)}`,
    { headers: { authorization: `Bearer ${process.env.DEMO_TOKEN ?? ''}` }, cache: 'no-store' },
  ).catch(() => null);

  const hits = res?.ok ? (await res.json()).data : [];

  return (
    <>
      <h1 style={{ fontSize: 20 }}>Results for “{q}”</h1>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {hits.map((h: { product: string; type: string; refId: string; title: string }) => (
          <li key={`${h.product}:${h.refId}`} style={{
            padding: '12px 0', borderBottom: '1px solid var(--helix-border)',
          }}>
            <span style={{
              fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em',
              color: 'var(--helix-muted)',
            }}>{h.product}</span>
            <div style={{ fontWeight: 600 }}>{h.title}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
