import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/session';

const API = process.env.INTERNAL_API_URL ?? 'http://localhost:4100';

/**
 * One fetch helper for every product surface.
 *
 * Product pages differ in what they render, never in how they authenticate,
 * handle a disabled product, or fail. Centralising that here is the frontend
 * mirror of what the kernel does on the server: the repetitive, easy-to-get-wrong
 * part is written once, so a new product UI cannot get it wrong.
 */
export async function fromApi<T>(path: string): Promise<{ data: T | null; problem: string | null }> {
  const token = await getAccessToken();
  if (!token) redirect('/login');

  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return { data: null, problem: 'The platform API is not reachable.' };

  // An expired access token sends the user back to sign in rather than showing a
  // broken page. (The SDK's silent-refresh path is the client-side equivalent.)
  if (res.status === 401) redirect('/login');

  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    return { data: null, problem: problem?.detail ?? `Request failed (${res.status}).` };
  }
  return { data: (await res.json()) as T, problem: null };
}
