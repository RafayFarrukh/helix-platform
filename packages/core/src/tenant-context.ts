/**
 * Request-scoped tenant context. Resolved once at the edge (gateway) and carried
 * through every layer, including into the database session so that Postgres
 * Row Level Security can enforce isolation even if application code forgets to.
 *
 * Defence in depth: app-level `tenantId` filter + DB-level RLS policy.
 */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  /** Data residency region — drives which regional cluster may serve the request. */
  region: 'us' | 'eu' | 'ap';
  tier: 'free' | 'pro' | 'business' | 'enterprise';
  /** Products this tenant has enabled. Gate at the edge, not in each product. */
  enabledProducts: string[];
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  /** Flattened permission keys, resolved from roles at token-mint time. */
  permissions: string[];
  /** Present when the caller is a machine (service account / API key). */
  serviceAccountId?: string;
}

export interface RequestContext {
  correlationId: string;
  tenant: TenantContext;
  auth: AuthContext | null;
}

export class TenantIsolationError extends Error {
  constructor(message = 'Cross-tenant access denied') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/** Guard used by repositories: a query without a tenant filter must never run. */
export function assertTenantScoped(where: Record<string, unknown>, tenantId: string): void {
  if (where.tenantId !== tenantId) {
    throw new TenantIsolationError(
      `Query is missing or has a mismatched tenant filter (expected ${tenantId})`,
    );
  }
}
