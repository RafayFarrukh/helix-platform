# Infrastructure as code

A **cell** is the unit of deployment: a complete, independent Helix stack serving
a slice of tenants. `modules/cell` builds one; `environments/production.tf`
composes four.

Two properties this buys:

- **Blast radius is a parameter.** A bad deploy or a failure is scoped to one
  cell's tenants. Rollouts go cell by cell.
- **A region is reproducible.** Recovering one, or opening a new one to satisfy a
  data-residency clause, is `terraform apply` with different variables.

Tenants are pinned to a cell by `Tenant.region` in the platform schema, so the
application-layer residency rule and the infrastructure that enforces it refer to
the same field.

> Not applied to a cloud account in this sample — see
> [docs/VERIFICATION.md](../../docs/VERIFICATION.md#what-is-not-verified).
