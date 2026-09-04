import { HelixClient } from '@helix/sdk';

/**
 * Server components talk to the API directly over the cluster network; browser
 * code talks to it through the public gateway. One factory, so no component ever
 * hard-codes a URL.
 */
export function serverClient(accessToken?: string): HelixClient {
  return new HelixClient(
    process.env.INTERNAL_API_URL ?? 'http://localhost:4100',
    accessToken ? { accessToken, refreshToken: '' } : null,
  );
}

export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';
