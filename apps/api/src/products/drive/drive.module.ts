import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { EventBus } from '@helix/core';
import { EVENT_BUS } from '../../platform/events/events.module';
import { SearchService } from '../../platform/search/search.service';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';

@Module({ controllers: [DriveController], providers: [DriveService], exports: [DriveService] })
export class DriveModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly events: EventBus,
    private readonly search: SearchService,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<{ nodeId: string; name: string }>('drive.node.created', async (e) => {
      await this.search.index({
        tenantId: e.tenantId, product: 'drive', type: 'drive.node',
        refId: e.payload.nodeId, title: e.payload.name,
      });
    });
  }
}
