# 1. Which Architecture Should Be Used?

## Answer in one line

**Start as a modular monolith with enforced product boundaries; grow into
services by extracting modules that have outgrown the shared deployable — never
by rewriting.**

The boundaries that a microservice architecture gives you are valuable. The
*distribution* is what costs you. So the design takes the boundaries on day one
(module contracts, schema isolation, event-only cross-product communication) and
defers the distribution until a measurable trigger justifies it.

---

## The table

| Part | Now (Start) Architecture | Future (Scale) Architecture | Notes / Reason |
|---|---|---|---|
| **Backend** | **Modular monolith** — one deployable, N product modules behind a strict manifest contract. Two things are already separate: the **worker** and the **realtime/media plane**. | **Service-based → microservices**, extracted per product as triggers fire. Then **cell-based**: each region runs a full stack serving a slice of tenants. | One deployable means one transaction, one deploy, one trace — enormous velocity while the domain is still moving. The module contract means extraction is a *move*, not a rewrite. Worker and media are already split because their scaling profile is genuinely different (see [ADR-0004](adr/0004-realtime-media-plane.md)). |
| **Admin** | **Separate Next.js application**, same API, elevated permission set. | Same app, hardened: private network + SSO + mandatory MFA, and split into *operations* vs *customer support* consoles once the audiences diverge. | Blast radius. An XSS or logic bug in an internal tool must not be reachable from a customer session. The cost of the split is near zero because it shares the design system and SDK packages. |
| **Frontend** | **One Next.js app**: a platform shell (nav, auth, launcher, global search) plus feature-based routes per product. | **Micro-frontends** (Module Federation): the shell stays, each product UI deploys independently. | With 3–20 products one app is faster. Past ~10 frontend teams the shared deploy pipeline becomes the bottleneck — that, not product count, is the trigger. |
| **API Layer** | **One versioned REST API** (`/v1/{product}/...`) with OpenAPI. Gateway *concerns* (authn, tenant resolution, rate limiting, entitlement) implemented as global guards. | **Dedicated gateway** (Envoy/Kong) doing the same concerns at the edge, **BFF per client**, **GraphQL federation** for cross-product aggregation, **gRPC** between services. | Clients are coded against `/v1/calendar/...` from day one. When Calendar moves to its own service, the gateway re-points that prefix and *no client changes*. The URL shape is the abstraction that buys the migration. |
| **Database** | **One PostgreSQL cluster, one schema per product** + a `platform` schema for the kernel. Row-Level Security on every tenant-owned table. One read replica. | **Database per service**, tenant **sharding** (Citus/Vitess) for the largest products, **CQRS read models**, per-region clusters, cold data tiered to object storage. | Schema-per-product means a product's tables are already a disjoint set. Extracting it is a `pg_dump` of one schema and a new connection string — not an untangling of foreign keys. |

---

## Why I selected this architecture

### The real risk at the start is not scale, it is being wrong

A platform intended to host 100+ products will get its product boundaries wrong
several times before it gets them right. Calendar and Meet look separate until
you discover that half of Meet's value is scheduling. Drive and Notes look
separate until documents need versioning.

In a monolith, moving a boundary is a refactor: rename a folder, move a table,
compile. In microservices, moving a boundary is a migration project across two
repos, two databases, two deploy pipelines and a versioned wire contract.
**Starting with microservices means paying the highest possible price for the
decision you are least qualified to make yet.**

### What actually makes 100+ products work is a kernel, not a topology

The property that makes a platform scale to many products is that **every
product gets identity, tenancy, RBAC, auditing, rate limiting, search,
notifications, storage and quotas for free, and cannot skip any of them**.

That is a *composition* property, not a *deployment* property. It is achievable —
and in fact easier to enforce — in a monolith, where the guards are registered
globally and a product physically cannot ship without them.

In this repo that kernel is `apps/api/src/platform/`, and the contract every
product satisfies is [`packages/core/src/product-manifest.ts`](../packages/core/src/product-manifest.ts).

### Distribution is a cost you should pay deliberately

Splitting into services from day one buys independent scaling and fault
isolation. It costs: network calls where method calls were, eventual consistency
where transactions were, distributed tracing to debug what a stack trace used to
show, N deploy pipelines, N on-call rotations, and a schema-versioning discipline
across every wire boundary.

That trade is correct **for a specific service, at a specific time, for a
specific reason**. It is not correct as a blanket default for 100 products, 95 of
which will serve modest traffic.

---

## Why it is suitable for the initial stage

| Initial-stage reality | How this architecture answers it |
|---|---|
| Small team, many products to ship | One repo, one deploy, one test suite. A new product is `pnpm gen:product` and domain logic. |
| Boundaries still uncertain | Moving a boundary is a refactor, and the compiler finds every caller. |
| Cross-product features are the differentiator | In-process events make "Meet schedules a Calendar entry" a 10-line subscription with no network, no retries, no saga. |
| Security must be right from day one | Global guards mean a product cannot be shipped that skips authn, tenancy, RBAC or audit. |
| Limited ops capacity | Three deployables (api, worker, media) — not thirty. |
| Investors/customers need velocity | Nothing about this stage is throwaway; every boundary drawn now is the boundary a service is extracted along later. |

---

## How it evolves as the platform grows

The evolution is *mechanical* because of three decisions made at the start:

1. **Products own a Postgres schema and may never read another's.**
   → Extracting a product's data is a schema dump, not a data migration.

2. **Products communicate only by publishing/subscribing to named events** on an
   `EventBus` interface — never by importing each other.
   → Replacing the in-process bus with Kafka changes one class. Zero product code.
   (Enforced by lint rule in [`packages/config/eslint/base.mjs`](../packages/config/eslint/base.mjs).)

3. **Clients address products by URL prefix** (`/v1/calendar/...`).
   → The gateway re-points a prefix at a new service; clients never notice.

The extraction runbook for any product is therefore always the same four steps:

```
1. Move its schema to its own database.        (schema is already disjoint)
2. Deploy its module as its own service.       (module is already self-contained)
3. Re-point /v1/{product} at the new service.  (clients unchanged)
4. Point its EventBus at Kafka.                (interface unchanged)
```

### When to extract — the triggers

A product leaves the monolith when **at least one** of these is measurably true.
Nothing else counts, and specifically "it feels big" and "microservices are
modern" do not:

| Trigger | Measurable threshold |
|---|---|
| **Divergent scaling profile** | The product's resource-per-request curve differs from the platform median by >5×, or it needs hardware the monolith does not (GPU, high-bandwidth, stateful media). |
| **Fault isolation** | Its failure modes threaten the platform SLO. A product that can exhaust connections or memory should not share a process with the other 99. |
| **Team contention** | >2 teams contending on one pipeline, or median PR-to-production >30 min because of unrelated tests. |
| **Release cadence conflict** | The product needs to ship hourly while the platform ships daily, or it needs a maintenance window the platform cannot take. |
| **Compliance / residency boundary** | Its data must live in a separate jurisdiction or certification scope (FedRAMP, healthcare) that would otherwise widen the audit boundary to everything. |
| **Runtime mismatch** | It needs a language or runtime the monolith cannot host — ML inference, video transcoding, a C++ SDK. |

Two products in this design are **born extracted** because they meet a trigger on
day one: the **worker** (divergent scaling profile — long jobs starve short
requests) and the **media plane** (stateful, bandwidth-bound, needs a different
runtime).

---

## How I will handle 100+ products

This is the question the whole design is organised around. Four mechanisms:

### 1. A single declarative contract per product

Every product ships a manifest declaring its key, DB schema, API prefix,
permissions, published/subscribed events, search documents, quotas and plan
availability
([`calendar.manifest.ts`](../apps/api/src/products/calendar/calendar.manifest.ts)).

The platform derives everything else from it: routing, the RBAC catalogue,
default role grants, search indexing, quota enforcement, billing entitlement, and
the app-launcher entry. **There is no second place to register a product.**

### 2. Boot-time validation of the whole product graph

Before a single request is served, the registry validates every manifest
together: duplicate keys, duplicate schemas, duplicate API prefixes, permission
collisions, permissions declared outside a product's own namespace, and events
subscribed to that nobody publishes. Any error refuses the boot
([`registry.ts`](../packages/core/src/registry.ts)).

This is verified, not asserted — see the transcript in
[docs/VERIFICATION.md](VERIFICATION.md#13-a-bad-manifest-cannot-start-the-platform):
a product that tries to declare `calendar.event.read` fails to start with a named
error. **The platform stays coherent at 100 products without a human reviewing
every product change.**

### 3. A generator, so product #101 is mechanical

```bash
pnpm gen:product notes --name "Helix Notes" --category productivity
```

Scaffolds the manifest, module, controller, service, tests and docs, and wires it
into the composition root and registry. In this repo that command produced a
fourth product which booted, routed and synced its permissions with **zero manual
edits** ([verification](VERIFICATION.md#12-product-101-is-a-command-not-a-project)).

### 4. A kernel that makes each product small

Because auth, tenancy, RBAC, audit, rate limiting, search, notifications, storage
and quotas live in the kernel, a product is only its domain logic. Compare the
Calendar service — it contains no security code at all — with what it would
contain if each of 100 teams implemented tenant scoping themselves.

The economics matter: **a cross-cutting fix ships once for 100 products instead of
100 times**, and a security control cannot be forgotten by a team that has never
read the platform docs.

---

## How I will maintain independent modules/products

| Boundary | How it is enforced | What enforces it |
|---|---|---|
| **Code** | A product may not import another product's internals. | ESLint `no-restricted-imports` rule — CI failure. |
| **Data** | A product may not read another product's tables. | Separate Postgres schema; the app role's grants are per-schema. |
| **Runtime** | Cross-product behaviour only through named events. | `EventBus` interface is the only injected cross-product dependency. |
| **Permissions** | A product may only declare permissions under its own namespace. | Registry validation — refuses boot. |
| **API surface** | A product owns exactly one URL prefix. | Registry validation — refuses boot. |
| **Ownership** | Every product declares an owning team. | Manifest `owner` field → routes alerts, review and on-call. |
| **Failure** | A product declares which products it degrades gracefully without. | Manifest `softDependencies` → fault-injection tests. |

The important property is that **all seven are machine-checked**. Boundaries
maintained by documentation and good intentions do not survive 100 products.

---

## How I will handle high traffic and large-scale users

Ordered by where load is actually absorbed — the earliest layer that can answer a
request is always the cheapest:

| Layer | Mechanism | Effect |
|---|---|---|
| **Edge** | CDN for static assets and cacheable GETs; TLS termination; geo-routing to the nearest region. | The majority of asset traffic never reaches origin. |
| **Gateway** | Per-tenant rate limits (tier-scaled), request-size caps, abusive-client shedding. | Bad traffic is rejected before it consumes application capacity. |
| **Application** | Stateless replicas behind an HPA scaling on CPU *and* in-flight requests; PDB + zone spread. | Horizontal scale to 120 replicas; no single zone is a SPOF. |
| **Cache** | Redis read-through with per-tenant key prefixes; tenant context and permissions cached so the hot path does zero DB reads for authz. | Removes the two queries that would otherwise be on 100% of requests. |
| **Database** | Connection pooling (PgBouncer), read replicas for read-heavy products, cursor pagination everywhere, covering indexes leading with `tenantId`. | `OFFSET`-free pagination means page 5000 costs the same as page 1. |
| **Async** | Anything slower than ~200ms is a queue job. Uploads bypass the API entirely via pre-signed URLs. | A 5 GB upload never occupies an API worker. |
| **Data growth** | Time-partitioned audit/event tables; tenant sharding for the largest products; cold data tiered to object storage. | Table size stays bounded as tenant count grows. |
| **Isolation** | Per-tenant quotas and rate limits; a noisy tenant is throttled, not the platform. | One customer's spike cannot degrade the other 999. |

The specific hot-path decision worth calling out: **permissions are resolved at
token-mint time and carried in the JWT**, so authorising a request is a string
comparison rather than a three-table join. At 50,000 requests/second that is the
difference between a database that copes and one that does not.

---

## Related decisions

- [ADR-0001 — Modular monolith over microservices at the start](adr/0001-modular-monolith-first.md)
- [ADR-0002 — Schema-per-product in a shared database](adr/0002-schema-per-product.md)
- [ADR-0003 — Events as the only cross-product dependency](adr/0003-event-driven-boundaries.md)
- [ADR-0004 — Realtime media as a separate plane from day one](adr/0004-realtime-media-plane.md)
- [ADR-0005 — Tenant isolation: application filter plus database RLS](adr/0005-tenant-isolation.md)
