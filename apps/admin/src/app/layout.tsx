import type { ReactNode } from 'react';

export const metadata = { title: 'Helix Admin' };

/**
 * The admin console is a *separate application*, not a route inside the user app.
 *
 * Reasons, in order of importance:
 *   1. Blast radius — an admin bug or XSS cannot reach customer sessions.
 *   2. Access path — it is deployed behind SSO + IP allow-list + mandatory MFA,
 *      which would be awkward to enforce per-route in a public app.
 *   3. Cadence — internal tooling ships many times a day without touching the
 *      customer-facing deploy.
 * It shares the design system and SDK packages, so the cost of the split is low.
 */
const NAV = [
  ['Tenants', '/tenants'],
  ['Products', '/products'],
  ['Audit log', '/audit'],
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, font: '14px/1.5 ui-sans-serif, system-ui, sans-serif', background: '#0C0A09', color: '#FAFAF9' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <nav style={{ width: 200, borderRight: '1px solid #292524', padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 20 }}>Helix Admin</div>
            {NAV.map(([label, href]) => (
              <a key={href} href={href} style={{ display: 'block', padding: '6px 0', color: '#A8A29E', textDecoration: 'none' }}>
                {label}
              </a>
            ))}
          </nav>
          <main style={{ flex: 1, padding: 24 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
