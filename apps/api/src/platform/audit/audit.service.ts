import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface AuditRecord {
  tenantId: string;
  actorId: string | null;
  actorType: 'user' | 'service_account' | 'system';
  product: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip?: string;
  userAgent?: string;
  correlationId: string;
  outcome: 'allowed' | 'denied';
  reason?: string;
}

/**
 * Single writer for the audit trail, used from two places because Nest runs
 * guards *before* interceptors:
 *   - AuditInterceptor  → successful mutations (it sees the handler result)
 *   - ProblemDetailsFilter → denials (401/403/429 are thrown by guards and never
 *     reach an interceptor)
 *
 * Recording only what succeeded would leave the trail blind to exactly the
 * behaviour worth detecting: someone probing for permissions they do not have.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget: auditing must never add latency to, or fail, a response. */
  record(entry: AuditRecord): void {
    const { outcome, reason, ...rest } = entry;
    void this.prisma.auditLog
      .create({ data: { ...rest, metadata: { outcome, ...(reason ? { reason } : {}) } } })
      .catch(() => undefined);
  }
}
