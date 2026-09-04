# 3. System Design

## Request path

```
Users → CDN/WAF → Load Balancer → API Gateway → Backend Services → Postgres / Redis / Kafka / S3
                                       │
                                       └── Auth · Tenancy · RBAC · Rate limit · Audit  (every request, no exceptions)
```

## Architecture diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                                             │
│  Web app (Next.js)   Admin console   Mobile   Partner APIs   Webhooks                 │
└───────────────────────────────┬──────────────────────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼──────────────────────────────────────────────────────┐
│  EDGE                                                                                │
│  CDN (static + cacheable GETs) · WAF (OWASP, bot rules) · DDoS · TLS · Geo-routing    │
└───────────────────────────────┬──────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────────────────┐
│  API GATEWAY  — every request passes all five, in this order                          │
│                                                                                       │
│   1. AUTHENTICATE   verify JWT (or API key) ................ 401 if absent/invalid    │
│   2. RESOLVE TENANT tenant comes from the token, never a header .. 403 if suspended   │
│   3. RATE LIMIT     per-tenant sliding window, tier-scaled ....... 429 if exceeded    │
│   4. ENTITLE + AUTHZ product enabled? permission held? ........... 403 if not         │
│   5. AUDIT          record the outcome, allowed or denied                             │
│                                                                                       │
│  Also: routing by /v1/{product}, request-size caps, correlation id, problem+json      │
└───────────────────────────────┬──────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────────────┐
        │                       │                               │
┌───────▼────────────┐ ┌────────▼─────────────┐ ┌───────────────▼──────────────┐
│  PLATFORM KERNEL   │ │  PRODUCT MODULES     │ │  SEPARATE PLANES (day one)   │
│                    │ │  (100+, uniform)     │ │                              │
│  Identity & Auth   │ │  ┌────────────────┐  │ │  ┌────────────────────────┐  │
│  Tenancy           │ │  │ Calendar       │  │ │  │ Worker                 │  │
│  RBAC              │ │  ├────────────────┤  │ │  │  outbox relay          │  │
│  Billing & Quotas  │ │  │ Meet           │  │ │  │  queue consumers       │  │
│  Audit             │ │  ├────────────────┤  │ │  │  scheduled maintenance │  │
│  Search            │ │  │ Drive          │  │ │  └────────────────────────┘  │
│  Notifications     │ │  ├────────────────┤  │ │  ┌────────────────────────┐  │
│  Storage           │ │  │ Notes  …  #101 │  │ │  │ Realtime / Media (SFU) │  │
│  Feature flags     │ │  └────────────────┘  │ │  │  WebRTC, stateful,     │  │
│  Product registry  │ │  no product may      │ │  │  bandwidth-bound       │  │
│                    │ │  import another      │ │  └────────────────────────┘  │
└─────────┬──────────┘ └──────────┬───────────┘ └──────────────┬───────────────┘
          │                       │                            │
          └───────────────────────┼────────────────────────────┘
                                  │
      ┌───────────────┬───────────┼────────────┬───────────────┬──────────────┐
      │               │           │            │               │              │
┌─────▼──────┐ ┌──────▼─────┐ ┌───▼────────┐ ┌─▼───────────┐ ┌─▼──────────┐ ┌─▼─────────┐
│ PostgreSQL │ │   Redis    │ │  Message   │ │  Object     │ │  Search    │ │ Secrets   │
│            │ │            │ │   Queue    │ │  Storage    │ │            │ │  (KMS/    │
│ schema per │ │ cache      │ │ outbox →   │ │ S3-compat   │ │ PG FTS →   │ │  Vault)   │
│ product    │ │ rate limit │ │ BullMQ →   │ │ pre-signed  │ │ OpenSearch │ │ per-tenant│
│ + RLS      │ │ sessions   │ │ Kafka      │ │ URLs only   │ │            │ │ DEKs      │
│ + replicas │ │            │ │            │ │             │ │            │ │           │
└────────────┘ └────────────┘ └────────────┘ └─────────────┘ └────────────┘ └───────────┘

      ┌────────────────────────────────────────────────────────────────────┐
      │  OBSERVABILITY (spans every layer above)                            │
      │  Traces (OpenTelemetry) · Metrics (Prometheus) · Logs (structured,  │
      │  correlation-id joined) · Alerting on SLOs · Error tracking         │
      └────────────────────────────────────────────────────────────────────┘
```

## The event flow — how products cooperate without coupling

This is the mechanism that makes 100 products behave like one product. Verified
running in this repo ([transcript](VERIFICATION.md#5-cross-product-behaviour-with-zero-coupling)):

```
  POST /v1/meet/rooms
        │
        ▼
  ┌───────────────┐   writes room row  ┌──────────────────────────────────┐
  │ Meet service  │───────────────────▶│ meet schema                      │
  └───────┬───────┘   + outbox row     │ platform.OutboxEvent (same TXN)  │
          │           in ONE transaction└──────────────────────────────────┘
          │
          ▼  publish "meet.room.scheduled"
  ┌──────────────────────────────────────────────────────────────┐
  │ EventBus  (in-process today → Kafka later, same interface)   │
  └───┬──────────────────────┬───────────────────────┬───────────┘
      │                      │                       │
      ▼                      ▼                       ▼
 ┌──────────┐        ┌──────────────┐        ┌────────────────┐
 │ Calendar │        │ Search       │        │ Notifications  │
 │ creates  │        │ indexes the  │        │ emails the     │
 │ an event │        │ room         │        │ attendees      │
 └──────────┘        └──────────────┘        └────────────────┘

 Meet does not import Calendar. Calendar does not import Meet.
 Neither knows Search or Notifications exist.
 Any of them can be extracted into its own service without the others changing.
```

The **transactional outbox** is what makes this safe: the domain row and the event
row are written in the same database transaction, so an event can never be
published for a change that rolled back, and a committed change can never fail to
publish. Delivery is at-least-once with exponential backoff, and poison events
are parked after 10 attempts rather than blocking the queue.

---

## Purpose of each major component

### Client & edge

| Component | Purpose | Why it is there |
|---|---|---|
| **CDN** | Serves static assets and cacheable GETs from the nearest PoP. | The cheapest request is the one that never reaches origin. For a global platform this is also the main latency lever. |
| **WAF / DDoS** | OWASP rule set, bot mitigation, volumetric absorption. | Attack traffic must be rejected before it consumes application capacity a customer is paying for. |
| **Load balancer** | Distributes across zones, terminates TLS, drains unhealthy replicas. | Uses `/readyz` (not `/healthz`) so a replica with a sick dependency is removed rather than serving errors. |

### API layer

| Component | Purpose | Why it is there |
|---|---|---|
| **API Gateway** | The single front door: routing, authn, tenant resolution, rate limiting, entitlement, audit. | Putting these here means **a product physically cannot ship without them** — the decisive property when 100 teams contribute. Starts as global guards in the monolith, becomes Envoy/Kong at scale, with identical semantics. |
| **Authentication** | Verifies credentials, issues short-lived access tokens and rotating refresh tokens, detects token reuse. | Short access tokens keep the hot path stateless (no session lookup); server-side refresh sessions keep revocation instant. |
| **Authorization / RBAC** | Resolves roles to permissions, checks `product.resource.action` with wildcard support. | Permissions are resolved at token-mint time and cached, so authorising a request costs a string comparison rather than a join. |
| **Rate limiting** | Per-tenant sliding window, scaled by plan tier. | Limits are per *tenant*, not per IP, because tenants share NATs and because the resource being protected is capacity per paying customer. |

### Backend

| Component | Purpose | Why it is there |
|---|---|---|
| **Platform kernel** | Identity, tenancy, RBAC, billing/quotas, audit, search, notifications, storage, feature flags, product registry. | The reason a product is small. Every cross-cutting concern is implemented once, correctly, and cannot be skipped. |
| **Product modules** | Domain logic for each of the 100+ products. | Uniform shape (manifest, module, controller, service) so any engineer can navigate any product on day one. |
| **Product registry** | Loads and validates the whole manifest graph at boot. | The guardrail that keeps 100 products coherent without central review of every change. |
| **Worker** | Outbox relay, queue consumers, scheduled maintenance. | Separate from day one: long jobs and short requests cannot share a process without the slow work eventually starving the fast work. |
| **Realtime / media plane** | WebRTC SFU for Meet. | Stateful, bandwidth-bound, scales on a completely different curve, and needs a different runtime. A textbook extraction trigger, met on day one. |

### Data

| Component | Purpose | Why it is there |
|---|---|---|
| **PostgreSQL** | System of record. One schema per product, `platform` schema for the kernel, RLS on every tenant-owned table. | Relational integrity where it matters, and schema isolation that makes later extraction a dump-and-restore. RLS gives tenant isolation a second, independent enforcement point. |
| **Read replicas** | Serve read-heavy products and all analytics/reporting. | Keeps a heavy report from competing with interactive traffic for the primary's resources. |
| **Redis** | Cache, rate-limit counters, queues. Per-tenant key prefixes. | Removes the tenant-context and permission lookups from the hot path — the two queries that would otherwise be on 100% of requests. |
| **Message queue** | Outbox relay → BullMQ today → Kafka at scale. | Decouples producers from consumers so a slow consumer cannot slow a request, and a failed consumer retries instead of losing work. |
| **Object storage** | All file bytes, via pre-signed URLs. | Bytes never pass through the API, so a 5 GB upload consumes no application capacity. Keys are prefixed `tenant/{id}/{product}/…`, making per-tenant deletion, encryption and lifecycle rules expressible as a prefix. |
| **Search** | One unified index across every product. | Users search for a thing, not for the product that owns it. Products push documents via events and never talk to a search engine, so Postgres FTS → OpenSearch is a one-file change. |
| **Secrets / KMS** | Key custody, envelope encryption, per-tenant data keys. | Per-tenant keys make "delete this customer's data" provable by destroying a key, and contain the blast radius of any single key compromise. |

### Cross-cutting

| Component | Purpose | Why it is there |
|---|---|---|
| **Notifications** | One pipeline for in-app, email, push and webhook. | User preferences, quiet hours, digesting, unsubscribes and localisation are implemented once instead of 100 times — and a badly-behaved product cannot spam a customer. |
| **Audit log** | Append-only record of every mutation *and every denial*, with actor, tenant, resource, IP and correlation id. | Written by kernel interceptor + exception filter, so coverage cannot regress when a team adds an endpoint. Recording only successes would blind the trail to exactly the behaviour worth detecting. |
| **Monitoring** | RED metrics per product and per endpoint, SLO alerting, saturation dashboards. | Metrics are labelled by product, so "the platform is slow" resolves to "product X is slow" in one query. |
| **Logging** | Structured JSON, correlation-id joined, no PII in message bodies. | One correlation id reconstructs a chain that spans a dozen products — essential once a single user action fans out. |
| **Tracing** | OpenTelemetry spans across gateway → service → database → queue. | The replacement for the stack trace you lose the day the first service is extracted. Adopted *before* the split, not after. |
| **Feature flags** | Percentage rollout, per-tenant enablement, kill switches. | The kill switch is the fastest lever in an incident: disable an expensive path without a deploy. |
