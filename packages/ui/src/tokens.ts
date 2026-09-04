/**
 * Design tokens, not hard-coded values.
 *
 * With 100+ products built by many teams, a shared token set is the only way the
 * platform looks like one product rather than 100. Products may compose
 * components; they may not invent colours or spacing.
 */
export const tokens = {
  color: {
    bg: 'var(--helix-bg)',
    surface: 'var(--helix-surface)',
    border: 'var(--helix-border)',
    text: 'var(--helix-text)',
    muted: 'var(--helix-muted)',
    accent: 'var(--helix-accent)',
    danger: 'var(--helix-danger)',
  },
  radius: { sm: '6px', md: '10px', lg: '16px' },
  space: (n: number) => `${n * 4}px`,
} as const;
