# ADR-0003 — Events are the only cross-product dependency

**Status:** Accepted · **Date:** 2026-09-04

## Context

Products must cooperate — Meet schedules Calendar entries, Drive files must be
searchable, everything must notify. Direct service-to-service calls would couple
products and make later extraction a rewrite.

## Decision

Products communicate **only** by publishing and subscribing to named domain
events through an `EventBus` interface. A product may never import another
product's code (enforced by an ESLint rule) and may never read its tables
(enforced by schema grants).

Events are written through a **transactional outbox**: the event row and the state
change commit together.

Today the bus is in-process; the interface is transport-agnostic so Kafka is a
one-class swap.

## Consequences

**Positive**
- Extracting a product is a deployment change, not a code change. This single
  property is what makes the whole evolution path in §6 credible.
- Adding a subscriber requires no change to the publisher — search, notifications
  and audit all attach without any product knowing they exist.
- The outbox gives exactly-once *recording* and at-least-once delivery: no event
  for a rolled-back change, no committed change without an event.

**Negative**
- Cross-product consistency is eventual, even in-process. A Meet room appears in
  Calendar within about a second, not synchronously.
- Handlers must be idempotent, because delivery is at-least-once.
- Debugging a chain requires correlation ids rather than a stack trace — which is
  why they are instrumented from day one.
- Event payloads are a contract; changing one carelessly breaks consumers. At
  scale this needs a schema registry with compatibility checks.

## Note

A real bug this ADR's discipline exposed during development: the Calendar entry
created *in reaction to* a Meet event initially did not publish
`calendar.event.created`, so it was never indexed for search. Reaction paths are
where "it works but is not indexed" bugs live. Fixed, and covered by
[verification §6](../VERIFICATION.md#6-unified-search-across-every-product).
