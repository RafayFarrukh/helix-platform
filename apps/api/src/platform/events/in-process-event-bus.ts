import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import type { DomainEvent, EventBus, EventHandler } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Today's event bus: writes to the transactional outbox, then a relay loop
 * dispatches to in-process subscribers.
 *
 * The important part is what it is *not*: products never call each other's
 * services directly. They publish and subscribe. That single constraint is what
 * makes the later move to Kafka a config change — `KafkaEventBus` implements the
 * same `EventBus` interface and the relay pushes to a topic instead of a
 * local handler map. No product code changes.
 */
@Injectable()
export class InProcessEventBus implements EventBus, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('events');
  private readonly handlers = new Map<string, EventHandler<any>[]>();
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Relay interval is deliberately short in-process; in production this is a
    // dedicated worker using SKIP LOCKED so many replicas can drain safely.
    this.timer = setInterval(() => void this.relay(), 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async publish<T>(event: Omit<DomainEvent<T>, 'occurredAt'>): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        tenantId: event.tenantId,
        name: event.name,
        payload: event.payload as object,
        correlationId: event.correlationId,
        actorId: event.actorId,
      },
    });
  }

  subscribe<T>(eventName: string, handler: EventHandler<T>): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler as EventHandler<any>);
    this.handlers.set(eventName, list);
  }

  /**
   * Drains the outbox. Failures are retried with exponential backoff and parked
   * after 10 attempts — a poison event must never block the queue for a tenant.
   */
  private async relay(): Promise<void> {
    const batch = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM platform."OutboxEvent"
      WHERE status = 'pending' AND "availableAt" <= NOW()
      ORDER BY "createdAt" LIMIT 50
      FOR UPDATE SKIP LOCKED`;

    for (const { id } of batch) {
      const row = await this.prisma.outboxEvent.findUnique({ where: { id } });
      if (!row) continue;

      const event: DomainEvent = {
        name: row.name,
        tenantId: row.tenantId,
        correlationId: row.correlationId,
        actorId: row.actorId,
        occurredAt: row.createdAt.toISOString(),
        payload: row.payload,
      };

      try {
        await Promise.all((this.handlers.get(row.name) ?? []).map((h) => h(event)));
        await this.prisma.outboxEvent.update({
          where: { id }, data: { status: 'published', publishedAt: new Date() },
        });
      } catch (err) {
        const attempts = row.attempts + 1;
        const backoffSec = Math.min(2 ** attempts, 300);
        await this.prisma.outboxEvent.update({
          where: { id },
          data: {
            attempts,
            status: attempts >= 10 ? 'failed' : 'pending',
            lastError: (err as Error).message.slice(0, 500),
            availableAt: new Date(Date.now() + backoffSec * 1000),
          },
        });
        this.logger.warn(`Event ${row.name} failed (attempt ${attempts}): ${(err as Error).message}`);
      }
    }
  }
}
