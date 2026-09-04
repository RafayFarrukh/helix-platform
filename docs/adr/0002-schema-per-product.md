# ADR-0002 — One Postgres schema per product, in a shared cluster

**Status:** Accepted · **Date:** 2026-09-04

## Context

Products need data isolation for later extraction, but running 100 databases for
100 products is operationally absurd at the start.

## Decision

One PostgreSQL cluster. **Each product owns exactly one schema**; the kernel owns
`platform`. A product may not read another product's schema — enforced by
per-schema grants, and by the registry refusing to boot on a duplicate schema
claim.

## Consequences

**Positive**
- Extraction is a `pg_dump --schema=calendar` plus a new connection string. There
  are no cross-product foreign keys to untangle, because there cannot be any.
- One cluster to back up, monitor, upgrade and fail over.
- Transactions still work *within* a product, which is where they are needed.
- The physical layout matches the logical boundary, so a violation is visible in
  a schema diff rather than discovered during a migration.

**Negative**
- Cross-product joins are impossible by design. This is the point, but it means
  reporting across products needs an ETL/CQRS read model rather than a SQL join.
- One cluster is still one failure domain until services are extracted.
- Migration ordering across schemas needs care in a single deploy.

**Rejected alternative — shared schema, `tenantId` only**
- No isolation between products; any product can read any table; extraction later
  requires identifying and untangling ownership table by table.

**Rejected alternative — database per product from the start**
- 100 databases, 100 backup policies, 100 connection pools, and no transactional
  integrity for a platform that has not yet proven its boundaries.
