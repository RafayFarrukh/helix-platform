/**
 * Distributed tracing, adopted *before* the first service is extracted.
 *
 * Adopting it afterwards means the first cross-service incident is debugged
 * without it, which is precisely the incident you needed it for. Spans are
 * created around the same boundaries that will later become network calls:
 * request handling, database queries, event publication and event consumption.
 */
export interface SpanAttributes {
  'helix.tenant_id'?: string;
  'helix.product'?: string;
  'helix.correlation_id'?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(error: Error): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, attributes?: SpanAttributes): Span;
  /** Runs `work` inside a span, ending it (and recording failures) either way. */
  withSpan<T>(name: string, attributes: SpanAttributes, work: (span: Span) => Promise<T>): Promise<T>;
}

const noopSpan: Span = { setAttribute: () => {}, recordException: () => {}, end: () => {} };

/**
 * No-op tracer so the sample runs without a collector. Swapping in the
 * OpenTelemetry SDK (OTLP to the Jaeger container in `infra/docker`) changes
 * this factory and nothing else.
 */
export function createNoopTracer(): Tracer {
  return {
    startSpan: () => noopSpan,
    async withSpan(_name, _attrs, work) {
      try {
        return await work(noopSpan);
      } catch (err) {
        noopSpan.recordException(err as Error);
        throw err;
      }
    },
  };
}

/** W3C traceparent, so context propagates across every hop including partners. */
export const TRACE_HEADER = 'traceparent';
