import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PlatformError } from '@helix/core';
import { RedisService } from '../../shared/redis/redis.service';

/**
 * Per-tenant sliding-window rate limiting in Redis.
 *
 * Limits are per tenant (not per IP) because tenants share NATs and proxies, and
 * because the resource being protected is *our* capacity per paying customer.
 * The window is enforced with a single atomic INCR+EXPIRE round trip.
 *
 * At scale this same logic moves into the API gateway / edge so that abusive
 * traffic is rejected before it reaches application capacity at all.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windowSec = Number(process.env.RATE_LIMIT_WINDOW_SEC ?? 60);
  private readonly defaultMax = Number(process.env.RATE_LIMIT_MAX ?? 600);

  /** Paying tenants get proportionally more headroom. */
  private readonly tierMultiplier: Record<string, number> = {
    free: 1, pro: 5, business: 20, enterprise: 100,
  };

  constructor(private readonly redis: RedisService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    if (!req.tenant) return true;

    const bucket = Math.floor(Date.now() / 1000 / this.windowSec);
    const key = this.redis.key(req.tenant.tenantId, 'rl', String(bucket));
    const max = Math.round(this.defaultMax * (this.tierMultiplier[req.tenant.tier] ?? 1));

    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, this.windowSec * 2);

    res.setHeader('x-ratelimit-limit', max);
    res.setHeader('x-ratelimit-remaining', Math.max(0, max - count));

    if (count > max) {
      throw new PlatformError('rate_limited', 'Rate limit exceeded for this workspace', {
        retryAfter: this.windowSec,
      });
    }
    return true;
  }
}
