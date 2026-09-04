import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { EventBus } from '@helix/core';
import { EVENT_BUS } from '../../platform/events/events.module';
import { SearchService } from '../../platform/search/search.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

/**
 * A product module wires three things and nothing else:
 *   1. its controller(s)     — HTTP surface
 *   2. its service(s)        — domain logic
 *   3. its event subscriptions — how it reacts to the rest of the platform
 *
 * Deleting this module's folder removes the product completely. That property is
 * what makes 100+ products manageable, and it is what makes extracting one into
 * its own deployable a move operation rather than an untangling exercise.
 */
@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly calendar: CalendarService,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    // React to Meet scheduling a room — cross-product behaviour with zero coupling.
    this.events.subscribe<{ roomId: string; title: string; startsAt: string; hostId: string }>(
      'meet.room.scheduled',
      async (e) => this.calendar.onMeetRoomScheduled(e.tenantId, e.correlationId, e.payload),
    );

    // Keep the unified index current. The product does not know what the index is.
    this.events.subscribe<{ eventId: string; title: string }>('calendar.event.created', async (e) => {
      await this.search.index({
        tenantId: e.tenantId, product: 'calendar', type: 'calendar.event',
        refId: e.payload.eventId, title: e.payload.title,
      });
    });

    this.events.subscribe<{ eventId: string }>('calendar.event.cancelled', async (e) => {
      await this.search.remove(e.tenantId, 'calendar', 'calendar.event', e.payload.eventId);
    });
  }
}
