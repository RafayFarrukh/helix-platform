'use client';
import type { CSSProperties } from 'react';
import { tokens } from './tokens';

export interface LauncherItem {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  ui?: { icon: string; color: string; launchUrl: string };
}

/**
 * The app launcher is the platform's front door and the component that makes
 * "100+ products" feel like one product. It is driven entirely by the API's
 * product registry — adding a product makes it appear here with no frontend
 * change at all.
 */
export function AppLauncher({ products }: { products: LauncherItem[] }) {
  const byCategory = products.reduce<Record<string, LauncherItem[]>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      {Object.entries(byCategory).map(([category, items]) => (
        <section key={category} style={{ marginBottom: tokens.space(8) }}>
          <h3 style={heading}>{category}</h3>
          <div style={grid}>
            {items.map((p) => (
              <a
                key={p.key}
                href={p.enabled ? p.ui?.launchUrl : '/settings/products'}
                style={{ ...card, opacity: p.enabled ? 1 : 0.45 }}
              >
                <span style={{ ...swatch, background: p.ui?.color ?? tokens.color.accent }} />
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {!p.enabled && <span style={badge}>Not enabled</span>}
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const heading: CSSProperties = {
  textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11,
  color: tokens.color.muted, margin: `0 0 ${tokens.space(3)}`,
};
const grid: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: tokens.space(3),
};
const card: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: tokens.space(3), padding: tokens.space(4),
  border: `1px solid ${tokens.color.border}`, borderRadius: tokens.radius.md,
  background: tokens.color.surface, textDecoration: 'none', color: tokens.color.text,
};
const swatch: CSSProperties = { width: 28, height: 28, borderRadius: tokens.radius.sm, flexShrink: 0 };
const badge: CSSProperties = { marginLeft: 'auto', fontSize: 11, color: tokens.color.muted };
