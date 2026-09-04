# ADR-0001 — Modular monolith first, microservices on evidence

**Status:** Accepted · **Date:** 2026-09-04

## Context

The platform must eventually host 100+ products for global, multi-tenant use. The
obvious inference is "100 products means microservices". The team is small, the
product boundaries are unproven, and there are no users yet.

## Decision

Start as a **modular monolith** with hard internal boundaries — one deployable for
products, plus a worker and a media plane that are separate from day one. Extract
services only when a product meets a written, measurable trigger.

The boundaries a microservice architecture provides are taken on day one:
schema-per-product, event-only cross-product communication, a manifest contract,
and per-product URL prefixes. The *distribution* is deferred.

## Consequences

**Positive**
- Refactoring a boundary is a compiler-checked rename, not a migration project.
  This matters because early boundaries will be wrong.
- Cross-product features are in-process: no network, no retries, no sagas.
- One transaction, one deploy, one stack trace.
- Three deployables to operate, not thirty.
- Security is enforced by globally registered guards a product cannot skip.

**Negative**
- One process means one blast radius for products that share it. Mitigated by
  per-tenant rate limits, quotas, kill switches, and by extracting anything that
  can destabilise its neighbours.
- All products scale together. Accepted while the platform is small; the trigger
  list exists precisely for when it stops being acceptable.
- Requires *discipline* that microservices enforce physically. Mitigated by making
  the boundaries machine-checked (lint rule, schema grants, registry validation)
  rather than documented.

**Rejected alternative — microservices from day one**
- Pays the highest possible price for the decision the team is least qualified to
  make yet (where the boundaries are).
- Distributed tracing, schema versioning, eventual consistency and N pipelines for
  a product with no users.
- Cross-product features — the platform's actual differentiator — become the
  hardest thing to build rather than the easiest.

**Rejected alternative — unstructured monolith**
- Cheapest today, and the reason platforms end up unable to extract anything.
  Every property that makes later extraction mechanical would be absent.
