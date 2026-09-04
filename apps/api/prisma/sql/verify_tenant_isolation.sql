-- Proof that tenant isolation is enforced by the database, not just by code.
-- Run:  psql -U helix -d helix -f verify_tenant_isolation.sql
\set ON_ERROR_STOP on

-- Two tenants with one calendar event each.
INSERT INTO platform."Tenant" (id, slug, name, "updatedAt")
VALUES ('11111111-1111-1111-1111-111111111111', 'rls-a', 'Tenant A', NOW()),
       ('22222222-2222-2222-2222-222222222222', 'rls-b', 'Tenant B', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar.calendars (id, "tenantId", "ownerId", name, timezone, color, "isDefault", "createdAt")
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'u1', 'A cal', 'UTC', '#000', false, NOW()),
       ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'u2', 'B cal', 'UTC', '#000', false, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar.events (id, "tenantId", "calendarId", title, "startsAt", "endsAt", "allDay", "createdBy", "createdAt", "updatedAt")
VALUES ('aaaaaaaa-1111-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'SECRET-A', NOW(), NOW(), false, 'u1', NOW(), NOW()),
       ('bbbbbbbb-1111-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 'SECRET-B', NOW(), NOW(), false, 'u2', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

SET ROLE helix_app;

\echo '--- Tenant A session: an unfiltered SELECT * still returns only A rows ---'
SET app.tenant_id = '11111111-1111-1111-1111-111111111111';
SELECT title FROM calendar.events ORDER BY title;

\echo '--- Tenant B session: same query, only B rows ---'
SET app.tenant_id = '22222222-2222-2222-2222-222222222222';
SELECT title FROM calendar.events ORDER BY title;

\echo '--- Explicitly asking for another tenant''s row returns nothing ---'
SELECT count(*) AS leaked_rows FROM calendar.events
WHERE "tenantId" = '11111111-1111-1111-1111-111111111111';

\echo '--- Writing a row for another tenant is rejected by WITH CHECK ---'
DO $$
BEGIN
  INSERT INTO calendar.events (id, "tenantId", "calendarId", title, "startsAt", "endsAt", "allDay", "createdBy", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'INJECTED', NOW(), NOW(), false, 'attacker', NOW(), NOW());
  RAISE EXCEPTION 'FAIL: cross-tenant insert succeeded';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS: cross-tenant insert blocked by RLS policy';
END $$;

\echo '--- No tenant set at all: zero rows, never "all rows" ---'
RESET app.tenant_id;
SELECT count(*) AS rows_visible_without_tenant FROM calendar.events;

RESET ROLE;
