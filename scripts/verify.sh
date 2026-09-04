#!/usr/bin/env bash
# Runs every claim in the design docs against the live system and prints the
# output. If a claim is not reproducible here, it does not belong in the docs.
set -uo pipefail
API="${API:-http://localhost:4100}"
PG="${PG_CONTAINER:-docker-postgres-1}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Deterministic starting state: calendar/meet/drive enabled, notes left disabled
# on purpose so the launcher demonstrates an un-entitled product.
docker exec -i "$PG" psql -U helix -d helix -q -c \
  "UPDATE platform.\"ProductAccount\" SET status='active' WHERE \"productKey\" IN ('calendar','meet','drive');" >/dev/null
docker exec -i "${REDIS_CONTAINER:-docker-redis-1}" redis-cli --scan --pattern 'tenantctx:*' 2>/dev/null \
  | xargs -r docker exec -i "${REDIS_CONTAINER:-docker-redis-1}" redis-cli DEL >/dev/null 2>&1

TID=$(docker exec -i "$PG" psql -U helix -d helix -tAc "SELECT id FROM platform.\"Tenant\" WHERE slug='acme';" | tr -d '\r ')

say "[1] Tenant isolation is enforced by the database (Postgres RLS)"
docker exec -i "$PG" psql -U helix -d helix -q < apps/api/prisma/sql/verify_tenant_isolation.sql 2>&1 | grep -vE '^\s*$'
docker exec -i "$PG" psql -U helix -d helix -q -c "DELETE FROM platform.\"Tenant\" WHERE slug IN ('rls-a','rls-b');" >/dev/null 2>&1

say "[2] Unauthenticated requests are refused with one platform-wide error shape"
curl -s "$API/v1/calendar/events" | python3 -m json.tool

say "[3] Login issues an access + rotating refresh token pair"
LOGIN=$(curl -s -X POST "$API/v1/auth/login" -H 'content-type: application/json' \
  -d '{"email":"owner@acme.test","password":"Helix-Demo-2026!"}')
AT=$(echo "$LOGIN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
echo "$LOGIN" | python3 -c 'import json,sys
d=json.load(sys.stdin)
print(json.dumps({k:(v[:28]+"…" if isinstance(v,str) and len(v)>28 else v) for k,v in d.items()}, indent=4))'

say "[4] The product registry drives the app launcher (no hard-coded product list)"
curl -s "$API/v1/platform/products" -H "authorization: Bearer $AT" | python3 -c 'import json,sys
for p in json.load(sys.stdin)["data"]:
    print("    %-10s %-16s %-14s enabled=%s" % (p["key"], p["name"], p["category"], p["enabled"]))'

say "[5] Cross-product behaviour with zero coupling: Meet -> event -> Calendar"
ROOM=$(curl -s -X POST "$API/v1/meet/rooms" -H "authorization: Bearer $AT" -H 'content-type: application/json' \
  -d '{"title":"Quarterly platform review","startsAt":"2026-10-01T14:00:00.000Z"}')
echo "$ROOM" | python3 -c 'import json,sys
d=json.load(sys.stdin); print("    Meet created room %s (%s...)" % (d["code"], d["id"][:8]))'
sleep 3
curl -s "$API/v1/calendar/events?from=2026-09-01T00:00:00Z&to=2026-12-31T00:00:00Z" \
  -H "authorization: Bearer $AT" | python3 -c 'import json,sys
for e in json.load(sys.stdin)["data"]:
    tag = "  <- created by the Meet event" if e["meetRoomId"] else ""
    print("    %-34s%s" % (e["title"], tag))'

say "[6] Unified search across every product from one query"
curl -s "$API/v1/platform/search?q=platform+review" -H "authorization: Bearer $AT" | python3 -c 'import json,sys
for h in json.load(sys.stdin)["data"]:
    print("    [%-8s] %-16s %s" % (h["product"], h["type"], h["title"]))'

say "[7] RBAC is enforced per permission"
MT=$(curl -s -X POST "$API/v1/auth/login" -H 'content-type: application/json' \
  -d '{"email":"member@acme.test","password":"Helix-Demo-2026!"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')
EID=$(curl -s "$API/v1/calendar/events?from=2026-09-01T00:00:00Z&to=2026-12-31T00:00:00Z" \
  -H "authorization: Bearer $AT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"][0]["id"])')
echo "    member  DELETE /v1/calendar/events/{id}:"
curl -s -X DELETE "$API/v1/calendar/events/$EID" -H "authorization: Bearer $MT" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("      %s %s - %s" % (d["status"], d["title"], d["detail"]))'
echo "    owner   DELETE the same event:"
echo "      $(curl -s -X DELETE "$API/v1/calendar/events/$EID" -H "authorization: Bearer $AT")"

say "[8] Product entitlement is checked before any product code runs"
docker exec -i "$PG" psql -U helix -d helix -q -c \
  "UPDATE platform.\"ProductAccount\" SET status='suspended' WHERE \"productKey\"='meet';" >/dev/null
docker exec -i "$PG" psql -U helix -d helix -q -c "SELECT 1" >/dev/null
echo "    (Meet disabled for this workspace; tenant cache TTL is 60s)"
sleep 62
curl -s -X POST "$API/v1/meet/rooms" -H "authorization: Bearer $AT" -H 'content-type: application/json' \
  -d '{"title":"blocked","startsAt":"2026-10-01T14:00:00.000Z"}' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("    %s %s - %s" % (d["status"], d["title"], d["detail"]))'
docker exec -i "$PG" psql -U helix -d helix -q -c \
  "UPDATE platform.\"ProductAccount\" SET status='active' WHERE \"productKey\"='meet';" >/dev/null

say "[9] Rate limit headers, scaled by plan tier"
curl -s -D - -o /dev/null "$API/v1/calendar/events?from=2026-09-01T00:00:00Z&to=2026-10-01T00:00:00Z" \
  -H "authorization: Bearer $AT" | grep -iE '^x-(ratelimit|correlation)' | sed 's/^/    /'

say "[10] Audit trail: successes and denials, written by the kernel"
docker exec -i "$PG" psql -U helix -d helix -q -c \
"SELECT product, action, metadata->>'outcome' AS outcome, left(coalesce(metadata->>'reason',''),34) AS reason
 FROM platform.\"AuditLog\" ORDER BY \"createdAt\" DESC LIMIT 5;"

say "[11] Transactional outbox: every event durably recorded, then relayed"
docker exec -i "$PG" psql -U helix -d helix -q -c \
"SELECT name, status, attempts FROM platform.\"OutboxEvent\" ORDER BY \"createdAt\" DESC LIMIT 4;"

say "[12] Quotas are enforced by the kernel, from limits the product declares"
QKEY="t:${TID}:quota:calendar:eventsPerMonth:$(date -u +%Y-%m)"
LIMIT=$(curl -s "$API/v1/platform/usage" -H "authorization: Bearer $AT" | python3 -c '
import json,sys
for u in json.load(sys.stdin)["data"]:
    if u["product"]=="calendar" and u["metric"]=="eventsPerMonth": print(u["limit"])')
echo "    business plan allows $LIMIT calendar events/month (from calendar.manifest.ts)"
docker exec -i "${REDIS_CONTAINER:-docker-redis-1}" redis-cli SET "$QKEY" $((LIMIT - 1)) >/dev/null
CALID=$(docker exec -i "$PG" psql -U helix -d helix -tAc \
  "SELECT id FROM calendar.calendars WHERE \"tenantId\"='$TID' LIMIT 1;" | tr -d '\r ')
mkevent() {
  curl -s -X POST "$API/v1/calendar/events" -H "authorization: Bearer $AT" -H 'content-type: application/json' \
    -d "{\"calendarId\":\"$CALID\",\"title\":\"$1\",\"startsAt\":\"2026-11-01T10:00:00.000Z\",\"endsAt\":\"2026-11-01T11:00:00.000Z\"}"
}
echo "    event #$LIMIT (at the limit):"
mkevent "At the limit" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("      created:", d.get("title") or d.get("detail"))'
echo "    event #$((LIMIT + 1)) (over the limit):"
mkevent "Over the limit" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("      %s %s - %s" % (d.get("status"), d.get("title"), d.get("detail")))'
echo "    counter after refusal: $(docker exec -i "${REDIS_CONTAINER:-docker-redis-1}" redis-cli GET "$QKEY" | tr -d '\r') (rolled back, no drift)"
docker exec -i "${REDIS_CONTAINER:-docker-redis-1}" redis-cli DEL "$QKEY" >/dev/null
docker exec -i "$PG" psql -U helix -d helix -q -c \
  "DELETE FROM calendar.events WHERE title IN ('At the limit','Over the limit');" >/dev/null

say "Done."
