import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../shared/http/decorators';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

/**
 * Two distinct probes, because they answer different questions:
 *   - /healthz  (liveness)  : is the process wedged? Never touches dependencies,
 *                             so a database blip cannot cause a restart storm.
 *   - /readyz   (readiness) : can this replica serve traffic? Checks dependencies,
 *                             so the load balancer drains it instead of erroring.
 */
@ApiExcludeController()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Public()
  @Get('healthz')
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Public()
  @Get('readyz')
  async ready() {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch { checks.database = 'down'; }
    try {
      await this.redis.client.ping();
      checks.redis = 'ok';
    } catch { checks.redis = 'down'; }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    return { status: healthy ? 'ready' : 'degraded', checks };
  }
}
