import { Injectable } from '@nestjs/common';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { ProductRegistryService } from '../registry/product-registry.service';

/**
 * Quota enforcement for every product, driven by the limits each product
 * declares in its manifest.
 *
 * The product does not know what its own limits are, and does not implement the
 * check. It calls `consume()` and the kernel resolves the tenant's tier, finds
 * the declared limit, and refuses if it is exceeded. That means changing a plan's
 * limits is a manifest edit, and adding a new plan tier does not require touching
 * 100 products.
 *
 * Counters live in Redis (fast, atomic, and the hot path) and are periodically
 * flushed to `ProductAccount.quotaUsage` by the worker so usage survives a Redis
 * failure and can be billed on.
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly registry: ProductRegistryService,
  ) {}

  /** Monthly window; the key rolls over on its own with no reset job to fail. */
  private periodKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  limitFor(productKey: string, tier: string, metric: string): number | null {
    const manifest = this.registry.registry.get(productKey);
    const limit = manifest?.quotas?.[tier as keyof typeof manifest.quotas]?.[metric];
    return typeof limit === 'number' ? limit : null;
  }

  /**
   * Atomically reserve `amount` of a metric. Increments first and rolls back on
   * refusal, so two concurrent requests cannot both pass a check at the limit —
   * a read-then-write would let them.
   */
  async consume(
    tenantId: string, tier: string, productKey: string, metric: string, amount = 1,
  ): Promise<{ used: number; limit: number | null }> {
    const limit = this.limitFor(productKey, tier, metric);
    const key = this.redis.key(tenantId, 'quota', productKey, metric, this.periodKey());

    const used = await this.redis.client.incrby(key, amount);
    if (used === amount) {
      await this.redis.client.expire(key, 70 * 24 * 3600); // outlives the period
    }

    if (limit !== null && used > limit) {
      await this.redis.client.decrby(key, amount);
      throw new PlatformError(
        'quota_exceeded',
        `Monthly ${metric} limit reached for ${productKey} on the ${tier} plan`,
        { product: productKey, metric, limit, used: used - amount },
      );
    }

    return { used, limit };
  }

  /** Everything a tenant is consuming, for the admin console and billing. */
  async usage(tenantId: string, tier: string) {
    const out: Array<{ product: string; metric: string; used: number; limit: number | null }> = [];

    for (const manifest of this.registry.registry.all()) {
      const metrics = manifest.quotas?.[tier as keyof typeof manifest.quotas];
      if (!metrics) continue;

      for (const metric of Object.keys(metrics)) {
        const raw = await this.redis.client.get(
          this.redis.key(tenantId, 'quota', manifest.key, metric, this.periodKey()),
        );
        out.push({
          product: manifest.key,
          metric,
          used: Number(raw ?? 0),
          limit: this.limitFor(manifest.key, tier, metric),
        });
      }
    }
    return out;
  }

  /** Called by the worker: persist Redis counters so usage is durable + billable. */
  async flush(tenantId: string, tier: string): Promise<void> {
    const usage = await this.usage(tenantId, tier);
    const byProduct = usage.reduce<Record<string, Record<string, number>>>((acc, u) => {
      (acc[u.product] ??= {})[u.metric] = u.used;
      return acc;
    }, {});

    for (const [productKey, quotaUsage] of Object.entries(byProduct)) {
      await this.prisma.productAccount.updateMany({
        where: { tenantId, productKey },
        data: { quotaUsage },
      });
    }
  }
}
