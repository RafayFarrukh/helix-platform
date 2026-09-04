import { z } from 'zod';

/**
 * The Product Manifest is the single contract every one of the 100+ products
 * must satisfy. It is what makes "add product #101" a bounded, mechanical task
 * instead of an architecture change.
 *
 * The manifest is *declarative on purpose*: the platform kernel reads it to wire
 * routing, RBAC, billing, search indexing, navigation, quotas and observability
 * without the product writing any cross-cutting code.
 */
export const ProductTier = z.enum(['free', 'pro', 'business', 'enterprise']);

export const PermissionDef = z.object({
  /** `product.resource.action` — e.g. `calendar.event.create` */
  key: z.string().regex(/^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/),
  description: z.string(),
  /** Roles that receive this permission by default when the product is enabled. */
  defaultRoles: z.array(z.enum(['owner', 'admin', 'member', 'guest'])).default([]),
});

export const SearchDocumentDef = z.object({
  /** Logical type name in the unified search index, e.g. `calendar.event`. */
  type: z.string(),
  /** Fields promoted into the shared index. Keeps 100+ products on one schema. */
  fields: z.array(z.enum(['title', 'body', 'tags', 'ownerId', 'updatedAt'])),
});

export const ProductManifest = z.object({
  /** Stable slug. Also the DB schema name and the URL namespace. */
  key: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  name: z.string(),
  version: z.string(),
  category: z.enum([
    'search', 'communication', 'productivity', 'cloud', 'commerce', 'developer', 'analytics',
  ]),
  /** Owning team — routes alerts, code review and on-call. */
  owner: z.string(),

  /** Mounted under `/v1/{key}` by the gateway. Never hand-written per product. */
  apiPrefix: z.string().optional(),

  /** Dedicated Postgres schema. No product may read another product's schema. */
  dbSchema: z.string(),

  /** Declared permissions are auto-registered into the RBAC catalogue. */
  permissions: z.array(PermissionDef).default([]),

  /** Domain events this product publishes. Consumers bind by name, not by import. */
  publishes: z.array(z.string()).default([]),
  /** Domain events this product subscribes to. Enforced at boot: no unknown topics. */
  subscribes: z.array(z.string()).default([]),

  /** Feeds the unified search service. */
  searchDocuments: z.array(SearchDocumentDef).default([]),

  /** Per-tier quotas enforced centrally by the kernel, not by the product. */
  quotas: z.record(ProductTier, z.record(z.string(), z.number())).optional(),

  /** Which tiers may enable this product at all. */
  availableIn: z.array(ProductTier).default(['free', 'pro', 'business', 'enterprise']),

  /** App-launcher metadata. */
  ui: z
    .object({ icon: z.string(), color: z.string(), launchUrl: z.string() })
    .optional(),

  /** Products this one degrades gracefully without. Used for fault-isolation tests. */
  softDependencies: z.array(z.string()).default([]),
});

export type ProductManifest = z.infer<typeof ProductManifest>;
/** Input shape: fields with defaults are optional at the call site. */
export type ProductManifestInput = z.input<typeof ProductManifest>;
export type PermissionDef = z.infer<typeof PermissionDef>;
export type ProductTier = z.infer<typeof ProductTier>;

/**
 * Parses at module load, so a malformed manifest is a startup crash rather than
 * a runtime surprise in one endpoint six weeks later.
 */
export function defineProduct(manifest: ProductManifestInput): ProductManifest {
  return ProductManifest.parse(manifest);
}
