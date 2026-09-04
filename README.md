# Helix Platform

A sample multi-tenant platform designed to host **100+ integrated products** —
search, meetings, calendar, storage, productivity, cloud services — for global
users and international clients.

This repository is both the **answer to the design task** and a **working sample
project**: the API runs, the security controls are enforced and verified, and the
frontends render from the live product registry.

---

## The design answers

| | Document |
|---|---|
| 1 | [Which architecture should be used?](docs/01-architecture.md) |
| 2 | [What will the folder structure be like?](docs/02-folder-structure.md) |
| 3 | [System design](docs/03-system-design.md) |
| 4 | [What technology will be used?](docs/04-technology.md) |
| 5 | [Security & scalability](docs/05-security-and-scalability.md) |
| 6 | [Future architecture](docs/06-future-architecture.md) |
| — | **[Verification — every claim, executed, with output](docs/VERIFICATION.md)** |
| — | [Decision records (ADRs)](docs/adr/) |

---

## The thesis in one paragraph

A platform hosting 100+ products does not need 100 microservices. It needs
**boundaries that a product cannot violate** and **a kernel a product cannot
bypass**. This design takes the boundaries on day one — schema per product,
events as the only cross-product dependency, one declarative manifest per product,
per-product URL prefixes — and defers the *distribution* until a written,
measurable trigger justifies it. The result: adding product #101 is a single
command, and extracting any product into its own service is a deployment change
rather than a rewrite.

---

## What actually runs

```bash
cp .env.example .env
pnpm install
pnpm infra:up            # Postgres, Redis, MinIO, Jaeger, Mailpit
pnpm db:migrate && pnpm db:seed
pnpm --filter @helix/api dev            # API   → :4100  (OpenAPI at /docs)
pnpm --filter @helix/web dev            # Web   → :3000
pnpm --filter @helix/admin dev          # Admin → :3001

pnpm test                # 38 unit + contract tests, no database needed
./scripts/verify.sh      # 16 controls exercised against the live system
```

Seeded login: `owner@acme.test` / `Helix-Demo-2026!`
(also `admin@` and `member@acme.test`, to see RBAC differences).

> The local stack's host ports are configurable in `.env`
> (`POSTGRES_PORT`, `REDIS_PORT`, …) so it never collides with other services.

### Verified, not asserted

Everything below was executed against the running system — full transcript in
[docs/VERIFICATION.md](docs/VERIFICATION.md):

- **Tenant isolation is enforced by the database.** An unfiltered
  `SELECT * FROM calendar.events` returns only the session tenant's rows; a
  cross-tenant insert is rejected; with no tenant set the answer is **zero rows,
  never all rows**.
- **Cross-product behaviour with zero coupling.** `POST /v1/meet/rooms` caused a
  Calendar event via the event bus. Neither product imports the other.
- **RBAC per permission.** A `member` is refused `calendar.event.delete`; the
  `owner` succeeds. Same route, enforced by a kernel guard.
- **Entitlement.** Disabling a product for a workspace makes its whole surface
  return 403 before any product code runs.
- **Audit records denials too**, attributed to the right product, with the reason.
- **A bad manifest cannot start the platform** — a product declaring another
  product's permission fails the boot with a named error.
- **`pnpm gen:product notes`** produced a fourth product that booted, routed and
  synced permissions with zero manual edits.
- **Quotas are enforced** from the limits each product's manifest declares: event
  #100,000 succeeds, #100,001 is refused with `402`, and the counter rolls back.

---

## Repository map

```
apps/
  api/        NestJS modular monolith — platform kernel + product modules
  web/        Next.js customer app — platform shell + product UIs
  admin/      Next.js internal console — separate deployable, blast radius
  worker/     Outbox relay, queue consumers, scheduled maintenance
packages/
  core/       THE CONTRACT: product manifest, EventBus, tenant context, registry
  sdk/        One typed API client for every frontend
  ui/         Design system — one look across 100 products
  config/     tsconfig + the ESLint rule that forbids cross-product imports
infra/        docker-compose (local), Kubernetes, Terraform
tools/        `pnpm gen:product` — product #101 in one command
docs/         The six answers, the ADRs, and the verification transcript
scripts/      verify.sh
```

## Where to look first

| To see… | Read |
|---|---|
| The contract every product obeys | [`packages/core/src/product-manifest.ts`](packages/core/src/product-manifest.ts) |
| The guardrail that keeps 100 products coherent | [`packages/core/src/registry.ts`](packages/core/src/registry.ts) |
| The security model, top to bottom | [`apps/api/src/app.module.ts`](apps/api/src/app.module.ts) |
| A product with no security code in it | [`apps/api/src/products/calendar/`](apps/api/src/products/calendar/) |
| Why extraction later is a move, not a rewrite | [`apps/api/src/platform/events/`](apps/api/src/platform/events/) |
| Tenant isolation, proven | [`apps/api/prisma/sql/`](apps/api/prisma/sql/) |

## Adding product #101

```bash
pnpm gen:product notes --name "Helix Notes" --category productivity
```

Scaffolds the manifest, module, controller, service and docs, and registers the
product in the composition root and registry. Add its models to
`schema.prisma`, migrate, and it is routed, permission-gated, audited,
rate-limited, searchable and in the app launcher — because every one of those
concerns lives in the kernel, not in the product.
