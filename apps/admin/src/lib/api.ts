const API = process.env.INTERNAL_API_URL ?? 'http://localhost:4100';

/**
 * The admin console holds no data of its own. It is a client of the same API as
 * every other surface, with an elevated permission set — so an operator cannot
 * see or do anything the API would not also permit through a normal token.
 */
export async function adminApi<T>(path: string): Promise<{ data: T | null; problem: string | null }> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN ?? process.env.DEMO_TOKEN ?? ''}` },
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return { data: null, problem: 'Platform API unreachable.' };
  if (!res.ok) {
    const p = await res.json().catch(() => null);
    return { data: null, problem: p?.detail ?? `Request failed (${res.status}).` };
  }
  return { data: (await res.json()) as T, problem: null };
}
