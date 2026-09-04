import { Inject, Injectable } from '@nestjs/common';
import type { EventBus, RequestContext } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EVENT_BUS } from '../../platform/events/events.module';

/**
 * Domain logic only. Authentication, tenant scoping, RBAC, auditing, rate
 * limiting, search indexing and notifications are all handled by the kernel.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async list(ctx: RequestContext) {
    // TODO: replace with this product's models once its Prisma schema is added.
    return { data: [], tenantId: ctx.tenant.tenantId };
  }

  async create(ctx: RequestContext, input: { title: string }) {
    const item = { id: crypto.randomUUID(), title: input.title };

    await this.events.publish({
      name: 'notes.item.created',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { itemId: item.id, title: item.title },
    });

    return item;
  }
}
