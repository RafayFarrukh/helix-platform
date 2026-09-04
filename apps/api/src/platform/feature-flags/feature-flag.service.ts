import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

/**
 * Feature flags serve three jobs here:
 *   1. progressive rollout of a new product or feature by tenant percentage
 *   2. per-tenant enablement for beta customers and enterprise pilots
 *   3. kill switches — disable an expensive or failing product path without a
 *      deploy, which is the fastest lever during an incident
 *
 * Bucketing is a stable hash of (flag, tenant), so a tenant never flaps between
 * variants as the percentage is raised.
 */
@Injectable()
export class FeatureFlagService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async isEnabled(key: string, tenantId: string): Promise<boolean> {
    const flag = await this.redis.cached(`flag:${key}`, 30, () =>
      this.prisma.featureFlag.findUnique({ where: { key } }),
    );
    if (!flag) return false;
    if (flag.tenantDeny.includes(tenantId)) return false;
    if (flag.tenantAllow.includes(tenantId)) return true;
    if (!flag.enabled) return false;
    if (flag.rolloutPct >= 100) return true;
    if (flag.rolloutPct <= 0) return false;

    const bucket = parseInt(createHash('sha1').update(`${key}:${tenantId}`).digest('hex').slice(0, 8), 16) % 100;
    return bucket < flag.rolloutPct;
  }
}
