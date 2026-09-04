import { Global, Module } from '@nestjs/common';
import { InProcessEventBus } from './in-process-event-bus';

export const EVENT_BUS = Symbol('EVENT_BUS');

/**
 * The bus is injected by token, never by concrete class, so swapping in a Kafka
 * implementation later touches exactly this one file.
 */
@Global()
@Module({
  providers: [InProcessEventBus, { provide: EVENT_BUS, useExisting: InProcessEventBus }],
  exports: [EVENT_BUS, InProcessEventBus],
})
export class EventsModule {}
