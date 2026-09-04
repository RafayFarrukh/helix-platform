import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { EventBus, RequestContext } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EVENT_BUS } from '../../platform/events/events.module';

/**
 * Meet is the product that proves the architecture is honest about its limits.
 *
 * Signalling and room metadata are ordinary stateless HTTP and live happily in
 * the monolith. Media (WebRTC SFU) is stateful, CPU/bandwidth bound and scales on
 * a completely different curve, so it is a separate deployable from day one —
 * see `docs/adr/0004-realtime-media-plane.md`. Splitting by *scaling profile*
 * rather than by fashion is the whole heuristic.
 */
@Injectable()
export class MeetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async scheduleRoom(ctx: RequestContext, input: { title: string; startsAt: string; maxParticipants?: number }) {
    const room = await this.prisma.meetRoom.create({
      data: {
        tenantId: ctx.tenant.tenantId,
        code: this.roomCode(),
        title: input.title,
        hostId: ctx.auth!.userId,
        sfuRegion: ctx.tenant.region,
        maxParticipants: input.maxParticipants ?? 100,
      },
    });

    // Calendar will create the matching entry. Meet neither knows nor cares
    // whether Calendar is installed.
    await this.events.publish({
      name: 'meet.room.scheduled',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { roomId: room.id, title: room.title, startsAt: input.startsAt, hostId: room.hostId },
    });

    return { ...room, joinUrl: `/apps/meet/${room.code}` };
  }

  async listRooms(ctx: RequestContext) {
    return this.prisma.meetRoom.findMany({
      where: { tenantId: ctx.tenant.tenantId, endedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** xxx-xxxx-xxx, human-readable and collision-resistant enough at this scale. */
  private roomCode(): string {
    const raw = randomBytes(8).toString('base64url').toLowerCase().replace(/[^a-z]/g, '').padEnd(10, 'x');
    return `${raw.slice(0, 3)}-${raw.slice(3, 7)}-${raw.slice(7, 10)}`;
  }
}
