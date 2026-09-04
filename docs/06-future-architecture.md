# 6. Future Architecture

## The path

```
  Stage 1              Stage 2               Stage 3               Stage 4              Stage 5
  MODULAR              DISTRIBUTED           MICROSERVICES         GLOBAL               PLATFORM
  MONOLITH             SERVICES              (selective)           INFRASTRUCTURE       AS A PRODUCT

  1 API                1 API + 3-6           ~15 services          Cells per region     3rd-party products
  1 worker             extracted services    + long-tail           Active-active        on the same kernel
  1 media plane        1 Postgres +          monolith              Data residency       Public API + billing
  1 Postgres           dedicated DBs         DB per service        Edge compute         Partner marketplace
  1 Redis              Kafka                 Kafka + schema        Global search
  Postgres FTS         OpenSearch            registry              Multi-region DB
                                             Micro-frontends

  ~10 products         ~30 products          ~60 products          100+ products        100+ products
  <10k tenants         <100k tenants         <1M tenants           global               + external developers
  1 region             1 region + CDN        2 regions             4+ regions
```

**The stages are triggered by measurements, not by calendar time or product
count.** A platform can sit at stage 1 with 40 products and be entirely correct.

---

## Stage 1 → 2: Distributed services

### Trigger

Any product meeting an extraction trigger from
[§1](01-architecture.md#when-to-extract--the-triggers). In practice the first
three are almost always:

| Service | Which trigger | Why it is first |
|---|---|---|
| **Search** | Divergent scaling + runtime mismatch | Indexing is write-heavy and bursty; queries are CPU-heavy. It contends with everything, and its data model is not relational. |
| **Notifications** | Divergent scaling + fault isolation | Email/push fan-out is spiky and depends on third parties. A provider outage must not be able to consume API capacity. |
| **The busiest product** | Divergent scaling | Whichever one is taking >30% of platform CPU. Extracting it lets it scale on its own curve and lets everything else stop scaling with it. |

### What changes

- Those services get their own deployables and their own databases (the schema
  they already own).
- **Kafka replaces BullMQ** as the event backbone: the outbox relay produces to
  topics instead of local handlers. The `EventBus` interface, and therefore every
  product, is unchanged.
- The gateway re-points the extracted URL prefixes. **Clients are unaffected**,
  because they were always coded against `/v1/{product}`.
- Distributed tracing becomes load-bearing — which is why it is instrumented at
  stage 1, before it is needed.

### What deliberately does not change

The remaining ~25 products stay in the monolith. There is no value in extracting
a product serving 50 requests per minute, and there is real cost.

---

## Stage 2 → 3: Selective microservices

### Trigger

Team topology, more than load. When more than two teams contend on one pipeline —
or median PR-to-production exceeds 30 minutes because of unrelated tests — the
deploy pipeline has become the bottleneck, and that is an organisational problem
solved by an architectural change.

### What changes

- ~15 services, each owned end-to-end by one team (build it, run it, page for it).
- **Database per service.** Cross-service reads become API calls or, preferably,
  locally maintained read models built from the event stream.
- **Schema registry** for events, with compatibility checks in CI. At this size,
  an unversioned event payload is an outage waiting to happen.
- **Sagas** for the few genuinely cross-service transactions, with compensating
  actions — replacing what used to be a single database transaction.
- **Micro-frontends**: each product UI deploys independently behind a shared shell.
- Service mesh for mTLS, retries, circuit breaking and traffic policy.

### The cost, stated honestly

This stage is where the architecture gets *harder*, not easier. Debugging spans
process boundaries. Consistency becomes eventual. Every team runs a pipeline and
an on-call rotation. It is worth it only because the alternative — 60 products
and 15 teams sharing one deployable — is worse. **Arriving here at stage 1 would
have been a mistake; arriving here at stage 3 is the point.**

The long tail of low-traffic products **stays in the monolith permanently**. There
is no version of this design where all 100 products become 100 services.

---

## Stage 3 → 4: Global infrastructure

### Trigger

Any one of: a data-residency clause in an enterprise contract; a latency SLO the
current region cannot meet; or a regional outage whose cost exceeds the cost of
multi-region.

### What changes

- **Cell-based architecture.** A cell is a complete, independent stack serving a
  slice of tenants. Tenants are pinned to a cell (`Tenant.region`, already in the
  data model). A failure is scoped to one cell rather than the platform, and a
  bad deploy can be rolled out cell by cell.
- **Multi-region active-active** with geo-routing; data residency enforced per
  tenant, per jurisdiction.
- **Global data:** tenant/identity metadata replicated everywhere (small, mostly
  read); tenant *data* stays in its home region (large, regulated).
- Edge rendering and edge caching for the frontend.
- Follow-the-sun on-call across regional teams.

### Why cells rather than plain multi-region

Multi-region alone gives geographic redundancy but keeps one global blast radius:
a bad migration still reaches every tenant. Cells make the blast radius a design
parameter — and let you buy availability for the tenants who pay for it without
paying for everyone.

---

## Stage 4 → 5: Platform as a product

### Trigger

External developers wanting to build on the platform, or the business wanting a
marketplace.

### What changes

The product manifest — the internal contract from day one — becomes the **public
extension contract**. Third-party products declare permissions, events, quotas and
UI entry points exactly as internal ones do, and run sandboxed with scoped OAuth
tokens, per-app rate limits and their own billing.

**This is the design's long-term payoff.** The contract that made 100 internal
products manageable is the same contract that makes external products possible,
because it was never coupled to being internal.

---

## When *not* to add complexity

The most important thing this document specifies is what to refuse:

| Do not add | Until |
|---|---|
| A second service | A named product meets a written extraction trigger |
| Kafka | An event needs replay, or a second independent consumer group exists |
| A separate search cluster | Postgres FTS demonstrably fails on volume or relevance |
| Sharding | A single Postgres primary, vertically scaled with read replicas, is genuinely saturated |
| Micro-frontends | The shared frontend pipeline is measurably the bottleneck |
| Multi-region | A contract, an SLO, or a costed outage requires it |
| A service mesh | There are enough services that per-service TLS and retry config is a real burden |
| A new datastore | An access pattern is proven unservable by Postgres, and someone owns the new store's SLO |

Every one of these is a real capability with a real cost. Adopting one early buys
a benefit you cannot yet use, and pays a cost you begin paying immediately —
usually in the currency you have least of at that stage: engineering attention.

---

## What makes the evolution possible

The whole path above is credible only because of four decisions made in stage 1,
none of which required predicting the future:

| Decision | What it buys later |
|---|---|
| **Products own a Postgres schema and may never read another's** | Extracting a service's data is a schema dump, not a data migration |
| **Cross-product communication only via a named-event `EventBus` interface** | Swapping in-process for Kafka is one class; product code is untouched |
| **Clients address products by URL prefix `/v1/{product}`** | The gateway re-points a prefix; no client ever changes |
| **Every cross-cutting concern lives in a kernel that products cannot bypass** | A security or compliance fix ships once for 100 products, before *and* after the split |

None of these is expensive at stage 1. All of them are close to impossible to
retrofit at stage 3. **That asymmetry — cheap now, impossible later — is the only
sound reason to do architectural work ahead of need**, and it is the criterion by
which every decision in this design was made.
