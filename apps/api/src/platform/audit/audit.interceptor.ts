import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PRODUCT_KEY } from '../../shared/http/decorators';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Audit logging for *successful* mutations. Denials are recorded by
 * ProblemDetailsFilter, because guards throw before interceptors run.
 *
 * Every mutating request against every product is recorded with actor, tenant,
 * resource, IP and correlation id. Compliance coverage therefore does not depend
 * on 100 teams remembering to log, and cannot regress when someone adds an
 * endpoint. Writes are fire-and-forget so auditing never adds latency to the
 * response path; durability comes from the append-only table plus WAL.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService, private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (!MUTATING.has(req.method) || !req.tenant) return next.handle();

    const product = this.reflector.getAllAndOverride<string>(PRODUCT_KEY, [ctx.getHandler(), ctx.getClass()]) ?? 'platform';

    return next.handle().pipe(
      tap((body) => {
        this.audit.record({
          tenantId: req.tenant.tenantId,
          actorId: req.auth?.userId ?? null,
          actorType: req.auth?.serviceAccountId ? 'service_account' : 'user',
          product,
          action: `${req.method} ${req.route?.path ?? req.originalUrl}`,
          resourceType: ctx.getClass().name.replace(/Controller$/, '').toLowerCase(),
          resourceId: (body as any)?.id ?? req.params?.id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 250),
          correlationId: req.correlationId,
          outcome: 'allowed',
        });
      }),
    );
  }
}
