-- ---------------------------------------------------------------------------
-- Row Level Security — the second, independent line of tenant isolation.
--
-- Layer 1 (application): every repository query filters by `tenantId`.
-- Layer 2 (database)   : these policies make a *missing* filter return zero rows
--                        instead of another tenant's data.
--
-- Both layers must fail simultaneously for a cross-tenant leak to happen, and
-- layer 2 cannot be bypassed by an application bug, an ORM mistake, or a raw
-- query someone added in a hurry.
--
-- Operationally: the API connects as `helix_app`, which is NOBYPASSRLS and is
-- NOT the table owner, and sets `app.tenant_id` for the transaction
-- (PrismaService.withTenant). Migrations run as the owner, which is why the
-- owner is intentionally left able to bypass — schema changes must not be
-- subject to a tenant predicate.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'helix_app') THEN
    CREATE ROLE helix_app LOGIN PASSWORD 'helix_app' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA platform, calendar, meet, drive TO helix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, calendar, meet, drive TO helix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform, calendar, meet, drive
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO helix_app;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_schema AS s, c.table_name AS n
    FROM information_schema.columns c
    WHERE c.table_schema IN ('platform', 'calendar', 'meet', 'drive')
      AND c.column_name = 'tenantId'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.s, t.n);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', t.s, t.n);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I.%I USING ("tenantId" = current_setting(''app.tenant_id'', true))
       WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t.s, t.n);
  END LOOP;
END $$;

-- The `Tenant` table itself is keyed by `id`, not `tenantId`, so it needs its
-- own policy or a tenant could enumerate other workspaces.
ALTER TABLE platform."Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON platform."Tenant";
CREATE POLICY tenant_self ON platform."Tenant"
  USING (id = current_setting('app.tenant_id', true));

-- Full-text index backing the unified search service. GIN over exactly the
-- expression the query uses, so the planner can use the index rather than
-- re-tokenising every row.
CREATE INDEX IF NOT EXISTS search_document_fts
  ON platform."SearchDocument"
  USING GIN (to_tsvector('english', title || ' ' || COALESCE(body, '')));

-- Audit trail is append-only. Even the application role cannot rewrite history.
REVOKE UPDATE, DELETE ON platform."AuditLog" FROM helix_app;
