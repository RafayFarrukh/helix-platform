import { AppLauncher } from '@helix/ui';

/**
 * The home page is the app launcher, rendered from the product registry.
 *
 * Note what is *not* here: a hard-coded list of products. Product #101 appears
 * the moment its manifest is registered on the API, with no frontend deploy.
 */
export default async function HomePage() {
  const res = await fetch(`${process.env.INTERNAL_API_URL ?? 'http://localhost:4100'}/v1/platform/products`, {
    headers: { authorization: `Bearer ${process.env.DEMO_TOKEN ?? ''}` },
    cache: 'no-store',
  }).catch(() => null);

  const products = res?.ok ? (await res.json()).data : [];

  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Your workspace</h1>
      <p style={{ color: 'var(--helix-muted)', marginTop: 0, marginBottom: 32 }}>
        Every product below is served by the same platform kernel: one identity, one
        permission model, one audit trail, one search index.
      </p>
      {products.length === 0 ? (
        <p style={{ color: 'var(--helix-muted)' }}>
          Start the API (<code>pnpm --filter @helix/api dev</code>) to load the product registry.
        </p>
      ) : (
        <AppLauncher products={products} />
      )}
    </>
  );
}
