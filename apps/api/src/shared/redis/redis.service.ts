import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Redis is used for three separate concerns, deliberately kept separable so that
 * at scale each can move to its own cluster without touching call sites:
 *   - cache        (read-through, per-tenant key prefix)
 *   - rate limits  (atomic counters)
 *   - queues       (BullMQ, later replaced by Kafka for inter-service events)
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    this.client.on('error', (err) => console.error('[redis]', err.message));
  }

  /** All cache keys are tenant-prefixed: no tenant can ever read another's cache. */
  key(tenantId: string, ...parts: string[]): string {
    return ['t', tenantId, ...parts].join(':');
  }

  async cached<T>(key: string, ttlSeconds: number, produce: () => Promise<T>): Promise<T> {
    const hit = await this.client.get(key);
    if (hit) return JSON.parse(hit) as T;
    const value = await produce();
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    return value;
  }

  async invalidatePrefix(prefix: string): Promise<void> {
    const stream = this.client.scanStream({ match: `${prefix}*`, count: 500 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await this.client.del(...keys);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
