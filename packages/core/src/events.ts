/**
 * The event bus interface is deliberately transport-agnostic.
 *
 * Today  : InProcessEventBus  (same process, same transaction boundary via outbox)
 * Tomorrow: KafkaEventBus / NATS  (same interface, different wire)
 *
 * Because products only ever depend on this interface, moving a product out of
 * the monolith is a deployment change, not a code change. This is the single
 * most important decision in the whole design.
 */
export interface DomainEvent<T = unknown> {
  /** `product.aggregate.action` — e.g. `calendar.event.created` */
  name: string;
  /** Every event is tenant-scoped. There is no such thing as a global event. */
  tenantId: string;
  /** Correlates an event chain back to the originating HTTP request. */
  correlationId: string;
  /** Actor that caused the event (user, service account or system). */
  actorId: string | null;
  occurredAt: string;
  payload: T;
}

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

export interface EventBus {
  /**
   * Publish is *transactional*: the implementation writes to the outbox table in
   * the caller's transaction and dispatches after commit. No lost events, no
   * phantom events, works identically in-process and over Kafka.
   */
  publish<T>(event: Omit<DomainEvent<T>, 'occurredAt'>): Promise<void>;
  subscribe<T>(eventName: string, handler: EventHandler<T>): void;
}

/** Well-known kernel events every product may rely on. */
export const KernelEvents = {
  TenantCreated: 'platform.tenant.created',
  TenantSuspended: 'platform.tenant.suspended',
  UserInvited: 'platform.user.invited',
  UserJoined: 'platform.user.joined',
  ProductEnabled: 'platform.product.enabled',
  ProductDisabled: 'platform.product.disabled',
  SubscriptionChanged: 'platform.subscription.changed',
} as const;
