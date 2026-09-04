# Helix Notes

| | |
|---|---|
| **Key** | `notes` |
| **Owner** | team-productivity |
| **Category** | productivity |
| **DB schema** | `notes` |
| **API prefix** | `/v1/notes` |

## Boundaries

- Owns the `notes` Postgres schema. No other product may read it.
- Communicates outward only by publishing the events listed in the manifest.
- Cross-cutting concerns (auth, RBAC, audit, search, notifications, quotas) come
  from the platform kernel — do not re-implement them here.

## Extraction checklist

When this product needs its own deployable, in order:
1. Move `notes` to its own database.
2. Point the gateway route `/v1/notes` at the new service.
3. Swap the in-process event bus for the Kafka client (same interface).
