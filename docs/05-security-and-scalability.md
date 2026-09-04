# 5. Security & Scalability

Each item below states the mechanism, where it is implemented in this repository,
and how it changes at scale. Items marked **verified** were executed against the
running system — see [VERIFICATION.md](VERIFICATION.md).

---

## Security

### Authentication

| | |
|---|---|
| **Now** | Email + password (scrypt, per-password salt, tuned to ~100 ms). Short-lived **access JWT (15 min)** carrying `userId`, `tenantId`, `sessionId` and resolved permissions. Opaque **refresh token (30 d)**, SHA-256 hashed at rest, one row per session, **rotated on every use**. TOTP MFA. |
| **Why this split** | Access tokens are stateless so the hot path performs no session lookup; refresh sessions are stateful so revocation is instant. A pure-JWT design cannot revoke; a pure-session design puts a datastore read on every request. |
| **Reuse detection** | Presenting an already-revoked refresh token means the token leaked. The response is to revoke **every session for that user**, not just refuse the request. |
| **Timing safety** | Login performs comparable work whether or not the account exists, so response time does not leak account existence. |
| **Code** | [`auth.service.ts`](../apps/api/src/platform/auth/auth.service.ts), [`password.ts`](../apps/api/src/platform/auth/password.ts) |
| **Future** | OIDC provider, SAML for enterprise SSO, SCIM provisioning, passkeys/WebAuthn, device trust, step-up auth for sensitive operations. |

### Authorization / RBAC

| | |
|---|---|
| **Model** | `user → membership (per tenant) → roles → permissions`. Permission keys are `product.resource.action`, **declared by each product's manifest** and synced into one catalogue at boot. |
| **Roles** | Four system roles (owner/admin/member/guest) provisioned per tenant, plus customer-defined custom roles. Manifests declare which default roles receive each permission. |
| **Hot path** | Permissions are resolved at token-mint time, cached in Redis, and embedded in the JWT — authorising a request is a string comparison with wildcard support (`calendar.*`), not a three-table join. |
| **Enforcement** | A global `PermissionGuard` reading a `@RequirePermission()` decorator. Routes are protected **by default**; opting out requires `@Public()`. Forgetting a decorator locks a route down, never opens one. |
| **Collision safety** | A product declaring a permission outside its own namespace fails the boot. **Verified** — [transcript](VERIFICATION.md#13-a-bad-manifest-cannot-start-the-platform). |
| **Verified** | A `member` is refused `calendar.event.delete` with a 403 problem document; the `owner` succeeds — [transcript](VERIFICATION.md#7-rbac-is-enforced-per-permission). |
| **Future** | ABAC for resource-level rules (sharing, ownership), policy-as-code (OPA/Cedar) for complex products, just-in-time elevation with automatic expiry. |

### Multi-Tenancy

Three independent layers, because tenant isolation is the one bug a platform
cannot survive:

1. **Token-derived tenant.** The tenant comes from the JWT, never from a header
   or path. A mismatched `X-Tenant-Id` header is treated as an attack and
   rejected. A caller cannot pivot workspaces by editing a request.
   ([`tenant.guard.ts`](../apps/api/src/platform/tenancy/tenant.guard.ts))
2. **Application scoping.** Every tenant-owned table carries `tenantId`, and
   every repository query filters on it.
3. **Database Row-Level Security.** Postgres policies enforce
   `tenantId = current_setting('app.tenant_id')`. The API connects as a
   `NOBYPASSRLS`, non-owner role.
   **A missing application filter returns zero rows, not another tenant's data.**

**Verified** ([transcript](VERIFICATION.md#1-tenant-isolation-is-enforced-by-the-database)): an unfiltered
`SELECT * FROM calendar.events` returns only the session tenant's rows; an insert
for another tenant is rejected by the `WITH CHECK` clause; and with no tenant set
the result is **zero rows, never all rows** — the safe failure direction.

Isolation extends beyond the database: cache keys are prefixed `t:{tenantId}:`,
object-storage keys are prefixed `tenant/{tenantId}/`, rate limits are per tenant,
and every domain event is tenant-scoped by construction.

*Future:* dedicated schemas or databases for enterprise tenants that require it,
per-tenant encryption keys (already modelled as `Tenant.kmsKeyId`), and per-region
placement driven by `Tenant.region`.

### API Security

- **Transport:** TLS 1.3 only, HSTS, no mixed content.
- **Input:** Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` —
  unknown fields are stripped and mass-assignment is impossible by construction.
- **Output:** One error shape platform-wide (RFC 9457 `problem+json`). Internal
  failures are logged with full context and returned opaque with a correlation id.
- **Headers:** Helmet (CSP, `X-Frame-Options: DENY`, `nosniff`, referrer policy,
  restrictive `Permissions-Policy`).
- **CORS:** Explicit origin allow-list, not a wildcard.
- **Injection:** Parameterised queries everywhere, including the raw SQL in the
  search service.
- **Machine access:** API keys are prefixed, hashed at rest, scoped, expiring, and
  rate-limited independently of user traffic.
- **Versioning:** `/v1/{product}` per product, so a breaking change in one product
  never forces the other 99 to move.
- *Future:* mTLS between services, request signing for partners, schema-diff
  contract tests in CI, gateway-level anomaly detection.

### Rate Limiting

Per-**tenant** sliding window in Redis (single atomic `INCR`+`EXPIRE`), scaled by
plan tier (free ×1 → enterprise ×100), with `X-RateLimit-*` headers on every
response. **Verified** — headers observed on a live request
([transcript](VERIFICATION.md#9-rate-limiting)).

Limits are per tenant rather than per IP because tenants share NATs and proxies,
and because the resource being protected is capacity per paying customer. A noisy
tenant is throttled; the other 999 are unaffected.

*Future:* enforcement at the gateway/edge so abusive traffic never reaches
application capacity; per-endpoint cost weighting (a search costs more than a
read); adaptive shedding under saturation.

### Data Encryption

- **In transit:** TLS 1.3 externally; mTLS between services at scale.
- **At rest:** Full-disk/volume encryption on database and object storage;
  envelope encryption with **per-tenant data keys** in KMS
  (`Tenant.kmsKeyId`), so destroying one key crypto-shreds one customer's data
  and provably satisfies a deletion request.
- **Application level:** Passwords are scrypt-hashed (never encrypted); refresh
  tokens and API keys are stored as SHA-256 digests; MFA secrets and PII columns
  are encrypted with the tenant key.
- **Key management:** Automated rotation, no key material in environment
  variables or source control, secrets injected at runtime.

### Secure File Storage

- Bytes **never pass through the API**: clients receive a pre-signed URL (15 min
  upload / 5 min download) and transfer directly to object storage.
  A 5 GB upload therefore consumes no application capacity.
- Keys are namespaced `tenant/{tenantId}/{product}/{uuid}/{name}`, making
  per-tenant deletion, encryption and lifecycle rules expressible as a prefix.
- MIME allow-list and size caps enforced before a URL is issued.
- Asynchronous malware scanning; a file is undownloadable until it is `clean`.
- Buckets are private with public access blocked at the account level; every
  object is reached through a signed, expiring URL.
- Versioning + object lock for ransomware resistance.
- **Code:** [`storage.service.ts`](../apps/api/src/platform/storage/storage.service.ts)

### Audit Logs

- **Append-only** table; `UPDATE` and `DELETE` are revoked from the application
  role at the database level, so the application *cannot* rewrite history.
- Written by a kernel **interceptor** (successful mutations) and the kernel
  **exception filter** (denials) — because Nest runs guards before interceptors, a
  403 thrown by a guard never reaches an interceptor. Recording only successes
  would blind the trail to exactly the behaviour worth detecting.
  **Verified** — a denied `DELETE` appears with `outcome=denied` and the missing
  permission as the reason ([transcript](VERIFICATION.md#10-the-audit-trail-records-denials-not-just-successes)).
- Records actor, actor type, tenant, product, action, resource, IP, user agent and
  correlation id — so one id reconstructs a chain spanning multiple products.
- Coverage does not depend on 100 teams remembering to log, and cannot regress
  when someone adds an endpoint.
- *Future:* streamed to immutable storage (WORM) with hash chaining, per-tenant
  retention policies, SIEM export.

### Backup & Recovery

| | |
|---|---|
| **Database** | Automated daily snapshots + continuous WAL archiving → **PITR to any second within 35 days**. |
| **Object storage** | Versioning, cross-region replication, object lock. |
| **Verification** | Restores are **tested on a schedule into an isolated environment**. An untested backup is a hypothesis, not a backup. |
| **Targets** | **RPO ≤ 5 minutes** (WAL shipping), **RTO ≤ 1 hour** (documented, rehearsed runbook). |
| **Tenant-level** | Per-tenant export and point-in-time restore, so one customer's mistake does not require a platform-wide rollback. |
| **Migrations** | Expand-migrate-contract, always backwards compatible, so a rollback never requires a schema rollback. |

---

## Scalability

### Database Scaling

Applied in order of cost, cheapest first:

1. **Indexing & query discipline** — every index leads with `tenantId`; cursor
   pagination everywhere (no `OFFSET`, so page 5000 costs the same as page 1).
2. **Connection pooling** — PgBouncer in transaction mode; a 120-replica
   deployment must not open 120× the pool against Postgres.
3. **Read replicas** — read-heavy products and all reporting/analytics move off
   the primary.
4. **Partitioning** — audit logs, events and other time-series tables partitioned
   by month; old partitions detached to cold storage.
5. **Vertical scaling** — genuinely the correct answer for a long time, and
   frequently skipped for being unfashionable.
6. **Schema → database split** — because each product already owns a schema,
   moving one to its own cluster is a dump plus a connection string.
7. **Sharding** — Citus/Vitess with `tenantId` as the shard key for the largest
   products. Tenant-keyed sharding is nearly ideal: almost every query is already
   single-tenant, so cross-shard queries are rare by construction.
8. **CQRS read models** — denormalised projections built from the event stream
   for expensive cross-product reads.

### Caching

| Layer | What | TTL / invalidation |
|---|---|---|
| CDN | Static assets, cacheable GETs | Immutable asset hashes; short TTL for public data |
| HTTP | `ETag` / `Cache-Control` on collection endpoints | Conditional requests avoid re-serialisation |
| Application | Tenant context, resolved permissions, feature flags | 30–300 s, explicitly invalidated on change |
| Query | Read-through per product | Per-tenant key prefix; invalidated on domain events |
| Database | Postgres shared buffers, materialised views for heavy aggregates | Refreshed by the worker |

The two caches that matter most are tenant context and permissions: without them
every request pays two database round trips before doing any work.

Cache correctness is handled by **explicit event-driven invalidation** rather than
short TTLs alone — a product that changes state publishes an event, and the cache
layer subscribes.

### Load Balancing

- Global anycast + geo-DNS routes users to the nearest healthy region.
- Layer-7 load balancer distributes across zones with least-outstanding-requests.
- Health-based removal uses `/readyz` (dependencies) rather than `/healthz`
  (process), so a replica with a sick dependency is drained instead of erroring.
- Graceful shutdown: `preStop` sleep + 45 s termination grace, so in-flight
  requests finish and the LB stops routing before the process exits.
- Sticky sessions are used **only** for the media plane, where they are inherent;
  everything else is stateless.

### High Availability

| Level | Mechanism |
|---|---|
| Process | ≥6 replicas, liveness/readiness/startup probes, `maxUnavailable: 0` rollouts |
| Zone | `topologySpreadConstraints` across AZs — losing a zone loses a third of capacity, not all of it |
| Node | PodDisruptionBudget (`minAvailable: 75%`) so a drain cannot take the service below quorum |
| Database | Synchronous standby with automatic failover |
| Cache | Redis Sentinel/Cluster; the application degrades to origin reads rather than failing |
| Region | Active-passive → active-active as the customer base globalises |
| **Dependency failure** | Products declare `softDependencies`; a product must degrade gracefully when a soft dependency is down, and fault-injection tests assert it |

The concrete example in this repo: if Calendar is unavailable, scheduling a Meet
room still succeeds — the calendar entry is created when the event is relayed.
Failure is deferred, not propagated.

### Disaster Recovery

- **Tiered objectives:** platform-critical paths (auth, gateway) RTO ≤ 15 min;
  standard products RTO ≤ 1 h; analytics RTO ≤ 24 h. Not everything deserves the
  same investment.
- **Infrastructure as code:** a region is a Terraform module, so recovery is
  `terraform apply` against a new region rather than archaeology.
- **Runbooks** for each failure class (region loss, database corruption, key
  compromise, bad deploy), rehearsed in game days.
- **Blast-radius containment:** cell-based topology means a failure is scoped to
  the tenants in one cell, not the whole platform.
- **Kill switches:** feature flags disable an expensive or failing product path
  without a deploy — the fastest lever available during an incident.
- **Data integrity:** the transactional outbox guarantees no event is lost on
  crash and no event is published for a change that rolled back.
