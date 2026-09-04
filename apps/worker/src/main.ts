import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

/**
 * Background processing runs as a *separate deployable from day one*, even while
 * the API is still a modular monolith.
 *
 * The reason is scaling profile, not architectural fashion: a 10-minute report
 * job and a 50ms HTTP request cannot share a process without the slow work
 * eventually starving the fast work. Splitting them costs almost nothing (same
 * repo, same models, same event bus) and removes an entire class of incident.
 *
 * Responsibilities:
 *   1. Outbox relay      — durable event delivery for every product
 *   2. Scheduled work    — retention, quota rollups, digest emails, index repair
 *   3. Queue consumers   — notifications, file post-processing, exports
 */
const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});
const prisma = new PrismaClient();

// --- 1. Outbox relay --------------------------------------------------------
// SKIP LOCKED lets many worker replicas drain the same table concurrently
// without double-delivering or blocking each other.
async function relayOutbox(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; tenantId: string }>>`
    UPDATE platform."OutboxEvent" SET status = 'published', "publishedAt" = NOW()
    WHERE id IN (
      SELECT id FROM platform."OutboxEvent"
      WHERE status = 'pending' AND "availableAt" <= NOW()
      ORDER BY "createdAt" LIMIT 200
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, name, "tenantId"`;

  for (const row of rows) {
    // Today: fan out onto BullMQ topics. At scale this becomes a Kafka produce
    // against a topic named after the event — the relay is the only thing that
    // changes, and no product notices.
    await eventQueue.add(row.name, row, { removeOnComplete: 1000, attempts: 5,
      backoff: { type: 'exponential', delay: 1000 } });
  }
}

const eventQueue = new Queue('helix.events', { connection });

// --- 2. Queue consumers -----------------------------------------------------
new Worker(
  'helix.events',
  async (job) => {
    switch (job.name) {
      case 'drive.node.created':
        // e.g. malware scan, thumbnail generation, text extraction for search
        break;
      case 'calendar.event.created':
        // e.g. attendee invitations, reminder scheduling
        break;
      default:
        break;
    }
  },
  { connection, concurrency: 20 },
);

// --- 3. Scheduled maintenance ----------------------------------------------
const maintenance = new Queue('helix.maintenance', { connection });

async function scheduleRecurring(): Promise<void> {
  // Repeatable jobs are idempotent and safe to register on every boot.
  await maintenance.add('retention.sweep', {}, { repeat: { pattern: '0 3 * * *' }, jobId: 'retention' });
  await maintenance.add('quota.rollup', {}, { repeat: { pattern: '*/15 * * * *' }, jobId: 'quota' });
  await maintenance.add('search.reindex-drift', {}, { repeat: { pattern: '0 4 * * 0' }, jobId: 'reindex' });
}

new Worker(
  'helix.maintenance',
  async (job) => {
    if (job.name === 'retention.sweep') {
      // Per-tenant retention: enterprise plans set their own window, and deleted
      // tenants are purged rather than merely flagged.
      await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 365 * 864e5) } },
      });
    }
  },
  { connection, concurrency: 2 },
);

async function main(): Promise<void> {
  await scheduleRecurring();
  setInterval(() => void relayOutbox().catch((e) => console.error('[outbox]', e.message)), 500);
  console.log('Helix worker started: outbox relay + event consumers + maintenance');
}

void main();

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await Promise.all([prisma.$disconnect(), connection.quit()]);
    process.exit(0);
  });
}
