import { cookies } from 'next/headers';

/**
 * Session handling for the web app.
 *
 * Tokens live in httpOnly cookies, never in localStorage: an XSS in any one of
 * 100 product UIs must not be able to read the token and impersonate the user
 * across every other product. The cost is that reads happen server-side, which
 * the App Router makes natural.
 */
const ACCESS = 'helix_at';
const REFRESH = 'helix_rt';

const SECURE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function getAccessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS)?.value ?? null;
}

export async function setSession(accessToken: string, refreshToken: string, expiresIn: number) {
  const jar = await cookies();
  jar.set(ACCESS, accessToken, { ...SECURE, maxAge: expiresIn });
  // The refresh token outlives the access token, and is the only credential that
  // can mint a new one — so it is the one that must never reach client JS.
  jar.set(REFRESH, refreshToken, { ...SECURE, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}
