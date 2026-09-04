import { adminApi } from '@/lib/api';

interface Product { key: string; name: string; enabled: boolean }

/**
 * Tenant lifecycle: plan, region, status and product enablement.
 *
 * Region is shown because it is not cosmetic — it determines which regional cell
 * may serve the tenant, and it is the field data-residency commitments are
 * enforced against.
 */
export default async function TenantsPage() {
  const { data, problem } = await adminApi<{ data: Product[] }>('/v1/platform/products');
  const enabled = data?.data.filter((p) => p.enabled).length ?? 0;

  return (
    <>
      <h1 style={{ fontSize: 20, marginBottom: 2 }}>Tenants</h1>
      <p style={{ color: '#A8A29E', marginTop: 0 }}>
        Every tenant is a unit of isolation, billing, data residency and blast radius.
      </p>

      {problem ? <p style={{ color: '#E08A76' }}>{problem}</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20, fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#A8A29E', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              <th style={{ padding: '8px 10px' }}>Workspace</th>
              <th style={{ padding: '8px 10px' }}>Plan</th>
              <th style={{ padding: '8px 10px' }}>Region</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
              <th style={{ padding: '8px 10px' }}>Products</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #292524' }}>
              <td style={{ padding: '10px', fontWeight: 600 }}>Acme Corp <span style={{ color: '#78716C', fontWeight: 400 }}>/acme</span></td>
              <td style={{ padding: '10px', color: '#A8A29E' }}>business</td>
              <td style={{ padding: '10px', color: '#A8A29E' }}>us</td>
              <td style={{ padding: '10px', color: '#8FBF7A' }}>active</td>
              <td style={{ padding: '10px', color: '#A8A29E' }}>{enabled} of {data?.data.length ?? 0} enabled</td>
            </tr>
          </tbody>
        </table>
      )}

      <p style={{ color: '#57534E', fontSize: 12, marginTop: 16 }}>
        Showing the seeded workspace. Tenant listing is a privileged endpoint and is
        deliberately not exposed through the tenant-scoped API used here.
      </p>
    </>
  );
}
