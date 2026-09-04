import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { EventBus } from '@helix/core';
import { EVENT_BUS } from '../../platform/events/events.module';
import { SearchService } from '../../platform/search/search.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({ controllers: [NotesController], providers: [NotesService], exports: [NotesService] })
export class NotesModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<{ itemId: string; title: string }>('notes.item.created', async (e) => {
      await this.search.index({
        tenantId: e.tenantId, product: 'notes', type: 'notes.item',
        refId: e.payload.itemId, title: e.payload.title,
      });
    });
  }
}
