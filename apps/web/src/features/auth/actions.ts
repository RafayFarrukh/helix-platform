'use server';

import { redirect } from 'next/navigation';
import { clearSession, setSession } from './session';

const API = process.env.INTERNAL_API_URL ?? 'http://localhost:4100';

/**
 * Credentials are posted to a server action, so they never travel through client
 * JavaScript and the API is never called from the browser with a password.
 */
export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const res = await fetch(`${API}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  }).catch(() => null);

  if (!res) return 'The platform API is not reachable. Is it running on :4100?';

  if (!res.ok) {
    const problem = await res.json().catch(() => null);
    // Show the API's message rather than inventing one — it already distinguishes
    // "invalid credentials" from "no active workspace", without leaking which.
    return problem?.detail ?? 'Sign in failed.';
  }

  const { accessToken, refreshToken, expiresIn } = await res.json();
  await setSession(accessToken, refreshToken, expiresIn);
  redirect('/');
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect('/login');
}
