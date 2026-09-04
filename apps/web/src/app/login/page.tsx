'use client';

import { useActionState } from 'react';
import { login } from '@/features/auth/actions';

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, null);

  return (
    <div style={{ maxWidth: 340, margin: '48px auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Sign in to Helix</h1>
      <p style={{ color: 'var(--helix-muted)', marginTop: 0, marginBottom: 24, fontSize: 13 }}>
        One account, every product in your workspace.
      </p>

      <form action={formAction} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--helix-muted)' }}>
          Email
          <input name="email" type="email" required defaultValue="owner@acme.test" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--helix-muted)' }}>
          Password
          <input name="password" type="password" required defaultValue="Helix-Demo-2026!" style={field} />
        </label>

        {error && (
          <p role="alert" style={{ color: 'var(--helix-danger)', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button type="submit" disabled={pending} style={button}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p style={{ color: 'var(--helix-muted)', fontSize: 12, marginTop: 20 }}>
        Seeded accounts: <code>owner@</code>, <code>admin@</code> and <code>member@acme.test</code> —
        sign in as each to see the permission model differ.
      </p>
    </div>
  );
}

const field: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--helix-border)',
  background: 'var(--helix-surface)', color: 'var(--helix-text)', font: 'inherit',
};
const button: React.CSSProperties = {
  padding: '9px 14px', borderRadius: 8, border: 0, background: 'var(--helix-accent)',
  color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer', marginTop: 4,
};
