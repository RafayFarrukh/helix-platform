import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * Unified search across every product.
 *
 * Products never talk to a search engine. They emit domain events; this service
 * subscribes and maintains one index. Today that index is a Postgres table with
 * full-text search — good to roughly a few million documents per tenant. When it
 * stops being enough, only this file changes: the same rows are streamed into
 * OpenSearch and the query below becomes an OpenSearch query. Callers and
 * products are unaffected.
 */
export interface SearchHit {
  product: string;
  type: string;
  refId: string;
  title: string;
  snippet: string | null;
  rank: number;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async index(doc: {
    tenantId: string; product: string; type: string; refId: string;
    title: string; body?: string; tags?: string[]; ownerId?: string;
  }): Promise<void> {
    await this.prisma.searchDocument.upsert({
      where: {
        tenantId_product_type_refId: {
          tenantId: doc.tenantId, product: doc.product, type: doc.type, refId: doc.refId,
        },
      },
      create: { ...doc, tags: doc.tags ?? [] },
      update: { title: doc.title, body: doc.body, tags: doc.tags ?? [] },
    });
  }

  async remove(tenantId: string, product: string, type: string, refId: string): Promise<void> {
    await this.prisma.searchDocument.deleteMany({ where: { tenantId, product, type, refId } });
  }

  /**
   * Tenant id is the first predicate on purpose: it is the partition key today
   * and the shard key later, so the query plan does not change when the table is
   * sharded.
   */
  async query(tenantId: string, q: string, products?: string[], limit = 20): Promise<SearchHit[]> {
    const filter = products?.length ? products : null;
    return this.prisma.$queryRaw<SearchHit[]>`
      SELECT product, type, "refId", title,
             ts_headline('english', COALESCE(body, ''), plainto_tsquery('english', ${q}),
                         'MaxFragments=1,MaxWords=20') AS snippet,
             ts_rank(to_tsvector('english', title || ' ' || COALESCE(body, '')),
                     plainto_tsquery('english', ${q})) AS rank
      FROM platform."SearchDocument"
      WHERE "tenantId" = ${tenantId}::text
        AND (${filter}::text[] IS NULL OR product = ANY(${filter}::text[]))
        AND to_tsvector('english', title || ' ' || COALESCE(body, '')) @@ plainto_tsquery('english', ${q})
      ORDER BY rank DESC
      LIMIT ${limit}`;
  }
}
