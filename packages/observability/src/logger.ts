/**
 * Structured logging.
 *
 * Two rules that matter more than the implementation:
 *   1. Every line carries the correlation id, so one id reconstructs a chain that
 *      spans a dozen products — the replacement for the stack trace you lose the
 *      day the first service is extracted.
 *   2. Nothing sensitive reaches the log. Redaction happens here, once, rather
 *      than depending on 100 teams remembering what is sensitive.
 */
const REDACT = new Set([
  'password', 'passwordhash', 'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'secret', 'apikey', 'secrethash', 'mfasecret',
]);

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  product?: string;
  [key: string]: unknown;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      REDACT.has(k.toLowerCase()) ? [k, '[redacted]'] : [k, redact(v, depth + 1)],
    ),
  );
}

export function createLogger(service: string) {
  const emit = (level: Level, message: string, ctx: LogContext = {}) => {
    // JSON lines: greppable in development, ingestible by any log platform in
    // production, with no format change between the two.
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        service,
        message,
        ...(redact(ctx) as object),
      }) + '\n',
    );
  };

  return {
    debug: (m: string, c?: LogContext) => process.env.NODE_ENV !== 'production' && emit('debug', m, c),
    info: (m: string, c?: LogContext) => emit('info', m, c),
    warn: (m: string, c?: LogContext) => emit('warn', m, c),
    error: (m: string, c?: LogContext) => emit('error', m, c),
  };
}
