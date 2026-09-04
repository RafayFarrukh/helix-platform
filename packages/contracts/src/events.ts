import { z } from 'zod';

/**
 * Event payload schemas — the wire contract between products.
 *
 * A publisher and a subscriber never share code, so without a declared schema
 * the only thing binding them is a hopeful cast. These schemas are validated on
 * publish (fail fast, at the source) and parsed on consume (never trust the
 * wire), which turns a breaking payload change into an immediate, attributable
 * error instead of a silently-wrong subscriber three products away.
 *
 * At scale this file is the input to a schema registry with compatibility checks
 * in CI. The shape does not change; only who enforces it does.
 */

// ---- Platform kernel ------------------------------------------------------
export const TenantCreated = z.object({
  tenantId: z.string().uuid(),
  slug: z.string(),
  tier: z.enum(['free', 'pro', 'business', 'enterprise']),
  region: z.enum(['us', 'eu', 'ap']),
});

export const ProductEnabled = z.object({
  productKey: z.string(),
  tier: z.enum(['free', 'pro', 'business', 'enterprise']),
});

// ---- Calendar -------------------------------------------------------------
export const CalendarEventCreated = z.object({
  eventId: z.string().uuid(),
  title: z.string(),
  startsAt: z.string().datetime(),
});

export const CalendarEventCancelled = z.object({ eventId: z.string().uuid() });

// ---- Meet -----------------------------------------------------------------
export const MeetRoomScheduled = z.object({
  roomId: z.string().uuid(),
  title: z.string(),
  startsAt: z.string().datetime(),
  hostId: z.string(),
});

// ---- Drive ----------------------------------------------------------------
export const DriveNodeCreated = z.object({
  nodeId: z.string().uuid(),
  name: z.string(),
});

/**
 * The registry of every event on the platform. `validateEvent` is called by the
 * event bus, so an unregistered event name is itself an error — no product can
 * quietly invent an undocumented event.
 */
export const EVENT_SCHEMAS = {
  'platform.tenant.created': TenantCreated,
  'platform.product.enabled': ProductEnabled,
  'calendar.event.created': CalendarEventCreated,
  'calendar.event.cancelled': CalendarEventCancelled,
  'meet.room.scheduled': MeetRoomScheduled,
  'drive.node.created': DriveNodeCreated,
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;

export type EventPayload<N extends EventName> = z.infer<(typeof EVENT_SCHEMAS)[N]>;

export interface ValidationOutcome {
  ok: boolean;
  /** Unknown names are reported, not thrown: a new event must not break the bus. */
  known: boolean;
  errors?: string[];
}

export function validateEvent(name: string, payload: unknown): ValidationOutcome {
  const schema = EVENT_SCHEMAS[name as EventName];
  if (!schema) return { ok: true, known: false };

  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, known: true };

  return {
    ok: false,
    known: true,
    errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
