import { Inject, Injectable } from '@nestjs/common';
import type { EventBus, RequestContext } from '@helix/core';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { EVENT_BUS } from '../../platform/events/events.module';
import { QuotaService } from '../../platform/billing/quota.service';
import type { CreateEventDto } from './dto/create-event.dto';

/**
 * Reference implementation of a product service. Note what it does NOT do:
 *   - no authentication, no permission checks (kernel guards did that)
 *   - no audit logging (kernel interceptor did that)
 *   - no search indexing (it publishes an event; the search service listens)
 *   - no email sending (it publishes an event; notifications listen)
 *   - no direct read of another product's tables
 *
 * What is left is domain logic. That ratio is what makes 100+ products
 * sustainable: each product is small because the kernel is doing the heavy,
 * repetitive, security-critical work once.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async listEvents(ctx: RequestContext, params: { from: Date; to: Date; cursor?: string; limit?: number }) {
    const limit = Math.min(params.limit ?? 50, 200);

    // Cursor pagination, not OFFSET: page 5000 costs the same as page 1, which
    // matters once a tenant has millions of rows.
    const rows = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId: ctx.tenant.tenantId,
        startsAt: { gte: params.from, lte: params.to },
        ...(params.cursor ? { id: { gt: params.cursor } } : {}),
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { attendees: true },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return { data, nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null };
  }

  async createEvent(ctx: RequestContext, dto: CreateEventDto) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) {
      throw new PlatformError('validation_failed', 'endsAt must be after startsAt');
    }

    const calendar = await this.prisma.calendarCalendar.findFirst({
      where: { id: dto.calendarId, tenantId: ctx.tenant.tenantId },
    });
    if (!calendar) throw new PlatformError('not_found', 'Calendar not found');

    // The product names the metric; the kernel owns the limit, the tier lookup
    // and the counter. Calendar has no idea what a "business" plan allows.
    await this.quota.consume(ctx.tenant.tenantId, ctx.tenant.tier, 'calendar', 'eventsPerMonth');

    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId: ctx.tenant.tenantId,
        calendarId: dto.calendarId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        allDay: dto.allDay ?? false,
        recurrence: dto.recurrence,
        createdBy: ctx.auth!.userId,
      },
    });

    await this.events.publish({
      name: 'calendar.event.created',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { eventId: event.id, title: event.title, startsAt: event.startsAt.toISOString() },
    });

    return event;
  }

  async deleteEvent(ctx: RequestContext, id: string) {
    const { count } = await this.prisma.calendarEvent.deleteMany({
      where: { id, tenantId: ctx.tenant.tenantId },
    });
    if (!count) throw new PlatformError('not_found', 'Event not found');

    await this.events.publish({
      name: 'calendar.event.cancelled',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { eventId: id },
    });
  }

  /**
   * Reacting to another product. Meet publishes `meet.room.scheduled`; Calendar
   * creates a matching event. Neither product imports the other, so Meet can be
   * extracted into its own service tomorrow with no change here.
   */
  async onMeetRoomScheduled(
    tenantId: string,
    correlationId: string,
    payload: { roomId: string; title: string; startsAt: string; hostId: string },
  ) {
    const calendar = await this.prisma.calendarCalendar.findFirst({
      where: { tenantId, ownerId: payload.hostId, isDefault: true },
    });
    if (!calendar) return; // Degrade quietly: a missing calendar must not fail Meet.

    const event = await this.prisma.calendarEvent.create({
      data: {
        tenantId,
        calendarId: calendar.id,
        title: payload.title,
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(new Date(payload.startsAt).getTime() + 60 * 60 * 1000),
        meetRoomId: payload.roomId,
        createdBy: payload.hostId,
      },
    });

    // An event created by reacting to another product is still a calendar event:
    // it must publish the same domain event, or it silently misses search
    // indexing, notifications and every other subscriber. Reaction paths are
    // where "it works but is not indexed" bugs come from.
    await this.events.publish({
      name: 'calendar.event.created',
      tenantId,
      correlationId,
      actorId: payload.hostId,
      payload: { eventId: event.id, title: event.title, startsAt: event.startsAt.toISOString() },
    });
  }
}
