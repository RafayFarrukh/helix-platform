# Verification

Every claim in the design documents was executed against the running system.
This file is the transcript. Reproduce it with:

```bash
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @helix/api dev      # in another shell
./scripts/verify.sh
```

Environment: Node 22, PostgreSQL 17, Redis 7, macOS. API on `:4100`.

---

## 1. Tenant isolation is enforced by the database

The application filters every query by `tenantId`. This proves the *second*
layer: even a query with no tenant filter at all cannot cross a tenant boundary,
because Postgres Row-Level Security refuses it.

```
--- Tenant A session: an unfiltered SELECT * still returns only A rows ---
  title   
----------
 SECRET-A
(1 row)
--- Tenant B session: same query, only B rows ---
  title   
----------
 SECRET-B
(1 row)
--- Explicitly asking for another tenant's row returns nothing ---
 leaked_rows 
-------------
           0
(1 row)
--- Writing a row for another tenant is rejected by WITH CHECK ---
NOTICE:  PASS: cross-tenant insert blocked by RLS policy
--- No tenant set at all: zero rows, never "all rows" ---
 rows_visible_without_tenant 
-----------------------------
                           0
(1 row)
```

The last case is the one that matters most: **with no tenant context set the
result is zero rows, never all rows.** The failure mode points in the safe
direction.

Source: [`001_row_level_security.sql`](../apps/api/prisma/sql/001_row_level_security.sql),
[`verify_tenant_isolation.sql`](../apps/api/prisma/sql/verify_tenant_isolation.sql)

---

## 2. One error shape for the whole platform

```
{
    "type": "https://errors.helix.dev/unauthenticated",
    "title": "unauthenticated",
    "status": 401,
    "detail": "Missing bearer token",
    "instance": "/v1/calendar/events",
    "correlationId": "5c53fdd4-f5a5-459d-b6fb-dbf1bb47fab6"
}
```

RFC 9457 `problem+json`, with a correlation id that ties the response to the log
line, the trace and the audit row. Every product returns this shape; no product
implements it.

---

## 3. Authentication

```
{
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6\u2026",
    "refreshToken": "7cP2XAy-4buek8wX7C1n-Uglkx03\u2026",
    "expiresIn": 900,
    "tenantId": "3b0d8365-673a-4a56-a28e-99f7\u2026"
}
```

A short-lived access JWT for the stateless hot path, and an opaque refresh token
stored hashed, one row per session, rotated on every use with reuse detection.

---

## 4. The product registry drives the platform

```
    calendar   Helix Calendar   productivity   enabled=True
    meet       Helix Meet       communication  enabled=True
    drive      Helix Drive      cloud          enabled=True
    notes      Helix Notes      productivity   enabled=False
```

There is no hard-coded product list anywhere — not in the API, not in the
frontend launcher. `notes` shows `enabled=False` because the workspace has not
subscribed to it, which is the entitlement system working, not a bug.

---

## 5. Cross-product behaviour with zero coupling

```
    Meet created room ayu-jusp-unu (57705be1...)
    Quarterly platform review           <- created by the Meet event
```

`POST /v1/meet/rooms` created a room. Meet published `meet.room.scheduled`.
Calendar — which does not import Meet, and does not know Meet exists — subscribed
and created the matching event.

Either product can be extracted into its own service without the other changing.

---

## 6. Unified search across every product

```
    [calendar] calendar.event   Quarterly platform review
    [meet    ] meet.room        Quarterly platform review
```

One query, results from two products. Neither product talks to a search engine:
they publish events, and the search service subscribes. Replacing Postgres FTS
with OpenSearch changes one file.

---

## 7. RBAC is enforced per permission

```
    member  DELETE /v1/calendar/events/{id}:
      403 forbidden - Missing permission: calendar.event.delete
    owner   DELETE the same event:
      {"deleted":true}
```

Same route, same event, two roles, two outcomes — enforced by a global guard
reading a declaration on the route, not by code inside the Calendar product.

---

## 8. Product entitlement is checked before any product code runs

```
    (Meet disabled for this workspace; tenant cache TTL is 60s)
    403 product not enabled - The "meet" product is not enabled for this workspace
```

Disabling the product for the workspace makes the whole product surface
unreachable. The check lives in the kernel, so it cannot be forgotten by product
number 87.

---

## 9. Rate limiting

```
    x-correlation-id: e7f53a94-5e08-4dc4-9726-81a5889249c6
    x-ratelimit-limit: 12000
    x-ratelimit-remaining: 11998
```

Per tenant rather than per IP, scaled by plan tier (this workspace is on
`business`: 600 × 20 = 12,000 per window).

---

## 10. The audit trail records denials, not just successes

```
 product  |                             action                              | outcome |               reason               
----------+-----------------------------------------------------------------+---------+------------------------------------
 meet     | POST /v1/meet/rooms                                             | denied  | The "meet" product is not enabled 
 calendar | DELETE /v1/calendar/events/:id                                  | allowed | 
 calendar | DELETE /v1/calendar/events/6eb705ca-deff-4a1c-a938-3f4e02e6d4e0 | denied  | Missing permission: calendar.event
 meet     | POST /v1/meet/rooms                                             | allowed | 
(4 rows)
```

Both outcomes are present, attributed to the right product, with the reason.
Successes are written by a kernel interceptor; denials by the kernel exception
filter, because Nest runs guards *before* interceptors and a guard's 403 never
reaches an interceptor. A trail that recorded only successes would be blind to
exactly the behaviour worth detecting.

---

## 11. The transactional outbox

```
           name           |  status   | attempts 
--------------------------+-----------+----------
 calendar.event.cancelled | published |        0
 calendar.event.created   | published |        0
 meet.room.scheduled      | published |        0
(3 rows)
```

The full causal chain, durably recorded: a Meet room was scheduled, which caused
a Calendar event, which was later cancelled. Each row was written in the same
database transaction as the state change it describes, so no event can exist for
a change that rolled back, and no committed change can fail to publish.

---

## 12. Product #101 is a command, not a project

```
$ pnpm gen:product notes --name "Helix Notes" --category productivity

Created product "notes"

  apps/api/src/products/notes/
    notes.manifest.ts     declares permissions, events, quotas, search docs
    notes.module.ts       wiring + event subscriptions
    notes.controller.ts   HTTP surface (tenant + RBAC enforced by the kernel)
    notes.service.ts      domain logic
    README.md             boundaries + extraction checklist

  Registered in app.module.ts and product-registry.service.ts
```

With **no manual edits**, the next boot produced:

```
[RoutesResolver]  NotesController {/v1/notes}:
[RouterExplorer]  Mapped {/v1/notes/items, GET} route
[RouterExplorer]  Mapped {/v1/notes/items, POST} route
[registry]        Registered 4 products, 15 permissions
```

Routed, permission-synced, searchable and visible in the app launcher.

---

## 13. A bad manifest cannot start the platform

The claim that 100 products stay coherent without central review depends on the
registry actually refusing bad input. Tested by making `notes` declare a
permission belonging to `calendar`:

```
ERROR [registry] [notes] Permission "calendar.event.read" must be namespaced under "notes."
ERROR [registry] [notes] Permission "calendar.event.read" already declared by "calendar"

Error: Product registry validation failed with 2 error(s). Refusing to start.
    at ProductRegistryService.onApplicationBootstrap
```

The process exits. The same validation covers duplicate product keys, duplicate
database schemas, duplicate API prefixes and events subscribed to that nobody
publishes.

Source: [`registry.ts`](../packages/core/src/registry.ts)

---

## 14. The frontend renders from the registry

The app launcher groups every product by category, driven entirely by
`GET /v1/platform/products`. Adding a product makes it appear with **no frontend
change**. `Helix Notes` renders dimmed with a "Not enabled" badge because the
workspace has not subscribed to it.

Both frontends build clean:

```
@helix/web    Route (app)              Size  First Load JS
              /                       936 B         103 kB
              /apps/calendar          131 B         102 kB
              /search                 131 B         102 kB

@helix/admin  /                       131 B         102 kB
              /audit                  131 B         102 kB
```

---

## 15. Quotas are enforced by the kernel, from limits the product declares

```
    business plan allows 100000 calendar events/month (from calendar.manifest.ts)
    event #100000 (at the limit):
      created: At the limit
    event #100001 (over the limit):
      402 quota exceeded - Monthly eventsPerMonth limit reached for calendar on the business plan
    counter after refusal: 100000 (rolled back, no drift)
```

Calendar's code names a metric (`eventsPerMonth`) and nothing else. The kernel
resolves the tenant's plan, finds the limit the manifest declared for that plan,
and refuses. Changing what a plan allows is a manifest edit; adding a plan tier
does not touch any of the 100 products.

The counter is incremented *before* the check and rolled back on refusal, so two
concurrent requests at the limit cannot both pass — a read-then-check would let
them.

---

## 16. The web app has a real session

```
GET /  (no session)   -> 307 redirect to /login
GET /login            -> 200
```

Signing in as `owner@acme.test` sets httpOnly cookies via a server action and
lands on the launcher with all four products rendered and "Sign out" in the
header; `/apps/calendar`, `/apps/meet` and `/apps/drive` all render against the
session, and `/apps/meet` shows the room created in check 5 above.

Tokens are in httpOnly cookies rather than `localStorage` on purpose: an XSS in
any one of 100 product UIs must not be able to read the token and impersonate the
user across every other product.

---

## What is *not* verified

Stated plainly, because a design document that implies more than it demonstrates
is worse than one that admits its edges:

- **Load and failover behaviour.** No load test, chaos test or failover drill was
  run. The scaling numbers in the docs are design targets, not measurements.
- **The Kubernetes manifests** are written but were not applied to a cluster.
- **The media/SFU plane** is designed and justified but not implemented; only its
  data model and its separation rationale exist here.
- **Kafka, OpenSearch, sharding, multi-region** are the future column throughout.
  Nothing in this repository runs them.
- **The storage pre-signer** is an HMAC stand-in so the sample runs without cloud
  credentials; production uses the S3 SDK presigner at the same call site.
- **`withTenant()`** sets the RLS session variable for transactional paths; most
  product reads currently rely on the application-level filter with RLS as the
  backstop. Connecting the API as the `helix_app` role in all environments is the
  remaining hardening step.
- **Terraform** describes four cells but was never applied to a cloud account, so
  it is reviewed code, not proven infrastructure.
- **Quota counters** are enforced from Redis. The worker flushes them to
  `ProductAccount.quotaUsage` for durability and billing, but that flush job is
  written, not exercised here.
