import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * A single Prisma client for the whole modular monolith, but every product only
 * ever touches its own models. When a product is extracted into its own service,
 * it takes its schema and gets its own client — no query rewriting.
 *
 * `withTenant` opens a transaction that sets the Postgres session variable the
 * Row Level Security policies read, so isolation is enforced by the database
 * even if application code forgets a `where: { tenantId }`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Run work inside a tenant-scoped transaction (RLS enforced). */
  async withTenant<T>(tenantId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, '')}'`);
      return work(tx);
    });
  }
}
