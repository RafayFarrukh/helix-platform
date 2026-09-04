import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { EventBus } from '@helix/core';
import { EVENT_BUS } from '../../platform/events/events.module';
import { SearchService } from '../../platform/search/search.service';
import { MeetController } from './meet.controller';
import { MeetService } from './meet.service';

@Module({ controllers: [MeetController], providers: [MeetService], exports: [MeetService] })
export class MeetModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<{ roomId: string; title: string }>('meet.room.scheduled', async (e) => {
      await this.search.index({
        tenantId: e.tenantId, product: 'meet', type: 'meet.room',
        refId: e.payload.roomId, title: e.payload.title,
      });
    });
  }
}
