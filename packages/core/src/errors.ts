/**
 * A single error taxonomy for 100+ products. Serialised as RFC 9457
 * (application/problem+json) so every client — web, admin, mobile, partner —
 * parses one shape forever.
 */
export type ProblemType =
  | 'validation_failed'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'product_not_enabled'
  | 'dependency_unavailable'
  | 'internal_error';

const STATUS: Record<ProblemType, number> = {
  validation_failed: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  quota_exceeded: 402,
  product_not_enabled: 403,
  dependency_unavailable: 503,
  internal_error: 500,
};

export class PlatformError extends Error {
  readonly status: number;
  constructor(
    readonly type: ProblemType,
    readonly detail: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail);
    this.name = 'PlatformError';
    this.status = STATUS[type];
  }

  toProblem(instance: string, correlationId: string) {
    return {
      type: `https://errors.helix.dev/${this.type}`,
      title: this.type.replace(/_/g, ' '),
      status: this.status,
      detail: this.detail,
      instance,
      correlationId,
      ...this.extra,
    };
  }
}
