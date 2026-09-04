/**
 * RED metrics (Rate, Errors, Duration), labelled by product.
 *
 * The labelling is the point: with 100+ products, "the platform is slow" must
 * resolve to "product X is slow" in one query, not a bisect. Every metric here
 * carries `product`, so every dashboard can break down by it.
 *
 * Cardinality is deliberately bounded — `route` is the *route pattern*
 * (`/v1/calendar/events/:id`), never the concrete URL. Putting an id in a label
 * is the classic way to take down a metrics backend.
 */
export interface Histogram {
  observe(value: number, labels: Record<string, string>): void;
}
export interface Counter {
  inc(labels: Record<string, string>, by?: number): void;
}
export interface Gauge {
  set(value: number, labels: Record<string, string>): void;
}

export interface Metrics {
  httpDuration: Histogram;
  httpTotal: Counter;
  httpInFlight: Gauge;
  eventLag: Histogram;
  outboxPending: Gauge;
}

/** Buckets chosen around the SLO boundaries that are actually alerted on. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/**
 * A no-op implementation so application code can be fully instrumented without
 * the sample requiring a metrics backend. In production this is swapped for the
 * prom-client registry; no call site changes.
 */
export function createNoopMetrics(): Metrics {
  const noop = { observe: () => {}, inc: () => {}, set: () => {} };
  return {
    httpDuration: noop, httpTotal: noop, httpInFlight: noop,
    eventLag: noop, outboxPending: noop,
  };
}

/** The SLOs these metrics exist to measure. Documented next to the instrument. */
export const SLO = {
  availability: 0.999,
  latencyP99Ms: 500,
  /** Time from event publication to the last subscriber completing. */
  eventPropagationP99Ms: 5_000,
} as const;
