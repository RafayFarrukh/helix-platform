import { AppLauncher } from '@helix/ui';
import { fromApi } from '@/lib/products';
import type { LauncherItem } from '@helix/ui';

/**
 * The home page is the app launcher, rendered from the product registry.
 *
 * Note what is *not* here: a hard-coded list of products. Product #101 appears
 * the moment its manifest is registered on the API, with no frontend deploy.
 */
export default async function HomePage() {
  const { data, problem } = await fromApi<{ data: LauncherItem[] }>('/v1/platform/products');

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Your workspace</h1>
      <p style={{ color: 'var(--helix-muted)', marginTop: 0, marginBottom: 32 }}>
        Every product below is served by the same platform kernel: one identity, one
        permission model, one audit trail, one search index.
      </p>
      {problem ? <p style={{ color: 'var(--helix-danger)' }}>{problem}</p>
               : <AppLauncher products={data?.data ?? []} />}
    </>
  );
}
