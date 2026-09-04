import { adminApi } from '@/lib/api';

interface Product {
  key: string; name: string; category: string; enabled: boolean;
  ui?: { color: string };
}
interface Usage { product: string; metric: string; used: number; limit: number | null }

/**
 * Product enablement and quota state for the workspace.
 *
 * The list is generated from the product registry, so a newly shipped product
 * appears here without an admin-console deploy — the same property the customer
 * launcher has, for the same reason.
 */
export default async function ProductsPage() {
  const [{ data: products, problem }, { data: usage }] = await Promise.all([
    adminApi<{ data: Product[] }>('/v1/platform/products'),
    adminApi<{ tier: string; data: Usage[] }>('/v1/platform/usage'),
  ]);

  if (problem) return <p style={{ color: '#E08A76' }}>{problem}</p>;

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>Products</h1>
      <p style={{ color: '#A8A29E', marginTop: 0 }}>
        Registered products and their quota consumption. Limits come from each product&rsquo;s
        manifest, not from a table an operator maintains by hand.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20, fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#A8A29E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <th style={{ padding: '8px 10px' }}>Product</th>
            <th style={{ padding: '8px 10px' }}>Category</th>
            <th style={{ padding: '8px 10px' }}>Status</th>
            <th style={{ padding: '8px 10px' }}>Quota usage</th>
          </tr>
        </thead>
        <tbody>
          {products?.data.map((p) => {
            const rows = usage?.data.filter((u) => u.product === p.key) ?? [];
            return (
              <tr key={p.key} style={{ borderTop: '1px solid #292524' }}>
                <td style={{ padding: '10px', fontWeight: 600 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: p.ui?.color ?? '#57534E', marginRight: 8,
                  }} />
                  {p.name}
                </td>
                <td style={{ padding: '10px', color: '#A8A29E' }}>{p.category}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{ color: p.enabled ? '#8FBF7A' : '#78716C' }}>
                    {p.enabled ? 'Enabled' : 'Not enabled'}
                  </span>
                </td>
                <td style={{ padding: '10px', color: '#A8A29E', fontVariantNumeric: 'tabular-nums' }}>
                  {rows.length === 0 ? '—' : rows.map((u) => (
                    <div key={u.metric}>
                      {u.metric}: {u.used.toLocaleString()} / {u.limit?.toLocaleString() ?? '∞'}
                    </div>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
