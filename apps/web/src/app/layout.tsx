import type { ReactNode } from 'react';
import { logout } from '@/features/auth/actions';
import { getAccessToken } from '@/features/auth/session';

export const metadata = {
  title: 'Helix',
  description: 'One platform, every product.',
};

/**
 * The platform shell. Every product renders inside it, which is what gives 100+
 * products a single identity, a single navigation model and a single search box.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const signedIn = Boolean(await getAccessToken());

  return (
    <html lang="en">
      <body>
        <style>{`
          :root {
            --helix-bg: #FAFAF9; --helix-surface: #FFFFFF; --helix-border: #E7E5E4;
            --helix-text: #1C1917; --helix-muted: #78716C; --helix-accent: #4F46E5;
            --helix-danger: #DC2626;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --helix-bg: #0C0A09; --helix-surface: #1C1917; --helix-border: #292524;
              --helix-text: #FAFAF9; --helix-muted: #A8A29E; --helix-accent: #818CF8;
            }
          }
          * { box-sizing: border-box; }
          body {
            margin: 0; background: var(--helix-bg); color: var(--helix-text);
            font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
          }
          a { color: inherit; }
        `}</style>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px',
          borderBottom: '1px solid var(--helix-border)', background: 'var(--helix-surface)',
        }}>
          <a href="/" style={{ fontWeight: 700, textDecoration: 'none' }}>Helix</a>
          <form action="/search" style={{ flex: 1, maxWidth: 520 }}>
            <input
              name="q"
              placeholder="Search across every product…"
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--helix-border)', background: 'var(--helix-bg)',
                color: 'inherit',
              }}
            />
          </form>
          {signedIn && (
            <form action={logout}>
              <button type="submit" style={{
                background: 'none', border: 0, color: 'var(--helix-muted)',
                font: 'inherit', cursor: 'pointer', padding: 0,
              }}>Sign out</button>
            </form>
          )}
        </header>
        <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
