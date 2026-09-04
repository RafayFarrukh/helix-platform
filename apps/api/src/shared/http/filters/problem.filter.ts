import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlatformError } from '@helix/core';
import { AuditService } from '../../../platform/audit/audit.service';

/**
 * One error shape for the entire platform (RFC 9457 problem+json).
 *
 * Clients for 100+ products should never have to learn a per-product error
 * format, and internal details must never leak to a tenant.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');

  constructor(private readonly audit: AuditService) {}

  /**
   * Security-relevant refusals are recorded here rather than in the audit
   * interceptor, because Nest runs guards before interceptors — a 401/403/429
   * thrown by a guard never reaches one.
   */
  private auditDenial(req: Request, status: number, reason: string): void {
    if (![401, 403, 429].includes(status)) return;
    const tenant = (req as any).tenant;
    if (!tenant) return;
    this.audit.record({
      tenantId: tenant.tenantId,
      actorId: (req as any).auth?.userId ?? null,
      actorType: 'user',
      product: (req as any).productKey ?? 'platform',
      action: `${req.method} ${req.originalUrl}`,
      resourceType: 'access',
      resourceId: null,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 250),
      correlationId: (req as any).correlationId ?? 'unknown',
      outcome: 'denied',
      reason,
    });
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const correlationId = (req as any).correlationId ?? 'unknown';

    if (exception instanceof PlatformError) {
      this.auditDenial(req, exception.status, exception.detail);
      res.status(exception.status).type('application/problem+json')
        .json(exception.toProblem(req.originalUrl, correlationId));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      this.auditDenial(req, status, exception.message);
      res.status(status).type('application/problem+json').json({
        type: `https://errors.helix.dev/http_${status}`,
        title: exception.message,
        status,
        detail: typeof body === 'string' ? body : (body as any).message,
        instance: req.originalUrl,
        correlationId,
      });
      return;
    }

    // Unknown failures are logged with full context and returned opaque.
    this.logger.error({ correlationId, path: req.originalUrl, err: exception });
    res.status(500).type('application/problem+json').json({
      type: 'https://errors.helix.dev/internal_error',
      title: 'internal error',
      status: 500,
      detail: 'An unexpected error occurred. Quote the correlation id to support.',
      instance: req.originalUrl,
      correlationId,
    });
  }
}
