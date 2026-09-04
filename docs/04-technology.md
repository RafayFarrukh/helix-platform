# 4. What Technology Will Be Used?

## The table

| Part | Now (Start) Technology | Future (Scale) Technology | Notes / Reason |
|---|---|---|---|
| **Backend** | **TypeScript + NestJS** (modular monolith), **Prisma** ORM, **Node 22** | Same for most products. **Go** for extracted hot-path services (gateway, search indexer, high-QPS products); **Rust/C++** for the media SFU; **Python** for ML products | NestJS's module + DI + global-guard model *is* the product-module contract — the platform kernel is expressible in the framework rather than fought against it. Polyglot only where a measurable trigger justifies it: the event contract is JSON over Kafka, so language choice becomes a per-service decision instead of a platform decision. |
| **Admin** | **Next.js (App Router) + React 19 + TypeScript**, shared `@helix/ui` | Same, plus SSO/OIDC + mandatory MFA + IP allow-list; split into ops and support consoles | Reusing the customer app's stack means one hiring profile and one design system. It stays a *separate deployable* for blast radius, not a separate stack. |
| **Frontend** | **Next.js 15 (App Router) + React 19 + TypeScript**, server components for data-heavy pages | **Module Federation micro-frontends**: shell + one federated remote per product; edge rendering per region | Server components keep tokens server-side and cut client JS — important when a launcher may list 100 products. The App Router's route-folder model is already the micro-frontend seam. |
| **API Layer** | REST + **OpenAPI 3.1**, URI versioning `/v1/{product}`, generated typed SDK | **Envoy/Kong** gateway, **gRPC** service-to-service, **GraphQL federation** for cross-product aggregation, **WebSocket/SSE** for realtime | REST first because it is cacheable at the CDN, debuggable with curl, and universally consumable by partners. gRPC and GraphQL are added where they earn their cost — internal latency and client-driven aggregation respectively. |
| **Database** | **PostgreSQL 17** — schema per product, RLS, PgBouncer, one read replica | **Citus/Vitess** tenant sharding for the largest products, DB-per-service, **ClickHouse** for analytics, **Redis/DynamoDB** for specific access patterns, per-region clusters | Postgres does relational integrity, JSONB, full-text search, LISTEN/NOTIFY, partitioning and `SKIP LOCKED` queues well enough that one engine covers the first several years. Adding a second datastore is a decision with an owner and an SLO, not a default. |

---

## Supporting technology

| Concern | Now | Future | Reason |
|---|---|---|---|
| **Monorepo** | pnpm workspaces + Turborepo | Same, with remote caching | One `pnpm build` builds the dependency graph in order. Turborepo's cache is what keeps CI fast as the repo grows to 100 products. |
| **Cache** | Redis 7 | Redis Cluster; per-concern clusters (cache / limits / queues split) | Keeping the three concerns behind separate methods now means splitting them later is a config change. |
| **Queue** | BullMQ on Redis | **Kafka** (or Redpanda) | BullMQ is right for job processing at small scale. Kafka is right when events need replay, multiple independent consumer groups, and retention — all of which arrive with service extraction, not before. |
| **Object storage** | S3-compatible (MinIO locally) | S3 + CloudFront, cross-region replication, lifecycle tiering | Pre-signed URLs from day one, so bytes never touch the API and the migration to a CDN-fronted bucket changes nothing in application code. |
| **Search** | PostgreSQL full-text (GIN) | **OpenSearch/Elasticsearch** | Postgres FTS is genuinely good to a few million documents per tenant. Because products publish events instead of talking to a search engine, the swap touches one service. |
| **Auth** | Own auth service, JWT + rotating refresh, TOTP MFA | **OIDC provider** (Keycloak/Auth0/WorkOS), SAML, SCIM provisioning, passkeys | Owning auth early avoids a vendor dependency on the most security-critical path while the model is still changing. Enterprise SSO/SCIM is a *sales* requirement, so it is adopted when enterprise deals arrive. |
| **Container / orchestration** | Docker Compose locally, one Kubernetes cluster | Multi-region Kubernetes, cell-based topology, Karpenter autoscaling | The local stack mirrors production topology in miniature — same components, one node each. |
| **CI/CD** | GitHub Actions: lint → typecheck → test → build → migrate → deploy | Same, plus progressive delivery (canary/blue-green) via Argo Rollouts | Migrations run as a separate, backwards-compatible step so a rollback never needs a schema rollback. |
| **Observability** | OpenTelemetry + Prometheus + Grafana + structured JSON logs | Same, plus distributed tracing across services, per-product SLO dashboards | Instrumented *before* the split, so the first extracted service is debuggable on day one rather than after an incident. |
| **IaC** | Terraform | Terraform modules, one reusable "cell" module | A region should be a parameterised module, never a hand-built snowflake. |
| **Secrets** | Env + KMS | Vault / cloud secret manager, per-tenant DEKs, automated rotation | Envelope encryption with per-tenant keys makes crypto-shredding a real deletion guarantee. |

---

## The decisions worth defending

### TypeScript across the whole stack

One language for backend, frontend, admin, worker, SDK and infrastructure
tooling. Types are shared through `packages/core` and `packages/contracts`
rather than duplicated, so a change to an event payload breaks the consumer's
build instead of production. For a platform whose main risk is coordination cost
across many products, a single type system spanning the wire is worth more than
picking the theoretically optimal language per component.

The escape hatch is deliberate: when a service meets an extraction trigger *and*
has a runtime mismatch (media, ML, very high QPS), it changes language. The event
contract is JSON over Kafka, so that becomes a local decision.

### NestJS rather than Express/Fastify directly

NestJS is chosen for a structural reason, not a preference: its module system,
dependency injection and **globally registered guards/interceptors** are exactly
the mechanism the platform kernel needs. `app.module.ts` reads as the security
model, and a product cannot opt out of the guards because they are registered at
the root. Reproducing that discipline on bare Express means writing — and
policing — the same framework by hand.

### PostgreSQL as the only datastore at the start

Postgres covers relational integrity, JSONB documents, full-text search, queues
(`SKIP LOCKED`), partitioning and RLS. Every additional datastore adds an
operational surface: backups, monitoring, failover, upgrades, expertise, and a
consistency question. **One database that a small team fully understands beats
four that nobody does.** Each later addition (OpenSearch, ClickHouse, Kafka)
appears in the future column attached to a specific trigger.

### Prisma, with an explicit limitation acknowledged

Prisma gives type-safe queries, good migrations and multi-schema support, which
matches schema-per-product exactly. Its weakness is complex analytical SQL — so
the search service already uses raw parameterised SQL where the ORM would get in
the way. Choosing a tool while naming the case where you will not use it is
better than pretending it has no edges.

### What is deliberately *not* adopted at the start

| Not adopted | Why not, yet | Trigger to adopt |
|---|---|---|
| Kubernetes-native service mesh | Adds a control plane, sidecar latency and a debugging surface for 3 deployables | >10 services needing mTLS and traffic policy between them |
| Kafka | BullMQ handles job processing; Kafka's value is replay and multiple consumer groups | First service extraction, or a consumer needing event replay |
| GraphQL | REST + OpenAPI generates a typed SDK and is CDN-cacheable | A client needing to aggregate across ≥3 products in one round trip |
| Microservices | See [ADR-0001](adr/0001-modular-monolith-first.md) | The extraction triggers in [§1](01-architecture.md#when-to-extract--the-triggers) |
| Multi-region active-active | Doubles operational complexity for a single-region customer base | First enterprise contract with a data-residency clause, or a latency SLO the current region cannot meet |
| Separate search cluster | Postgres FTS is sufficient at this document volume | >5M documents per tenant, or a relevance/faceting requirement Postgres cannot express |

Every row in that table is a cost avoided today with a written, measurable
condition for paying it later. **That list is the architecture** as much as the
components that were adopted.
