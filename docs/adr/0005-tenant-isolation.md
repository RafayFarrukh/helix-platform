# ADR-0005 — Tenant isolation: application filter *and* database RLS

**Status:** Accepted · **Date:** 2026-09-04

## Context

Cross-tenant data leakage is the one bug a multi-tenant platform cannot survive.
With 100+ products and many teams, at least one query will eventually be written
without a tenant filter. The architecture must assume that and survive it.

## Decision

Three independent layers:

1. **Tenant comes from the token, never from a header or path.** A mismatched
   `X-Tenant-Id` is rejected as an attack.
2. **Application scoping.** Every tenant-owned table carries `tenantId`; every
   repository query filters on it.
3. **Postgres Row-Level Security.** Policies enforce
   `tenantId = current_setting('app.tenant_id')`. The API connects as a
   non-owner, `NOBYPASSRLS` role.

Isolation extends to cache keys (`t:{tenantId}:`), object-storage prefixes
(`tenant/{tenantId}/`), rate limits and every domain event.

## Consequences

**Positive**
- A forgotten `where` clause returns **zero rows**, not another tenant's data.
  The failure mode points in the safe direction.
- Two independent mechanisms must fail simultaneously for a leak.
- RLS cannot be bypassed by an ORM mistake or a hand-written raw query.
- Verified, not asserted:
  [verification §1](../VERIFICATION.md#1-tenant-isolation-is-enforced-by-the-database).

**Negative**
- Every query path must set `app.tenant_id` for the transaction, which the
  transactional helper does but which raw paths must remember.
- Slight per-transaction overhead from the session variable.
- Migrations must run as the owner role, which bypasses RLS — correct, but it
  means migration code needs the same review scrutiny as security code.
- Debugging is confusing until you learn to check the tenant GUC first: "the row
  is definitely there" and "the query returns nothing" are both true.

**Rejected alternative — application filtering alone**
- One forgotten `where` clause in one of 100 products is a breach. Betting the
  company on 100 teams never making that mistake is not a security control.

**Rejected alternative — database per tenant**
- The strongest isolation, and unmanageable at 100,000 tenants: migrations,
  connection pools and backups all multiply by tenant count. Reserved as an
  option for individual enterprise customers who require it.
