import { Injectable } from '@nestjs/common';
import type { TenantContext } from '@helix/core';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

/**
 * Tenant resolution and the tenant's product entitlements.
 *
 * This is on every single request, so it is cached aggressively (60s) and
 * invalidated explicitly when a tenant enables/disables a product or changes
 * plan. One Redis GET per request is the entire multi-tenancy overhead.
 */
@Injectable()
export class TenancyService {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async resolve(tenantId: string): Promise<TenantContext> {
    const cacheKey = `tenantctx:${tenantId}`;
    const ctx = await this.redis.cached<TenantContext | null>(cacheKey, 60, async () => {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { productAccounts: { where: { status: { in: ['active', 'trialing'] } } } },
      });
      if (!tenant || tenant.status !== 'active') return null;
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        region: tenant.region as TenantContext['region'],
        tier: tenant.tier as TenantContext['tier'],
        enabledProducts: tenant.productAccounts.map((p) => p.productKey),
      };
    });

    if (!ctx) throw new PlatformError('forbidden', 'Workspace is not active');
    return ctx;
  }

  async enableProduct(tenantId: string, productKey: string): Promise<void> {
    await this.prisma.productAccount.upsert({
      where: { tenantId_productKey: { tenantId, productKey } },
      create: { tenantId, productKey },
      update: { status: 'active' },
    });
    await this.redis.client.del(`tenantctx:${tenantId}`);
  }

  async disableProduct(tenantId: string, productKey: string): Promise<void> {
    await this.prisma.productAccount.updateMany({
      where: { tenantId, productKey },
      data: { status: 'suspended' },
    });
    await this.redis.client.del(`tenantctx:${tenantId}`);
  }
}
