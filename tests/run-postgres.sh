#!/usr/bin/env bash
set -eu
project=$(cd -- "$(dirname -- "$0")/.." && pwd)
container="construction-crm-rls-check-$$"
if docker inspect "$container" >/dev/null 2>&1; then exit 1; fi
password=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker run -d --name "$container" --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD="$password" postgres:16-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres <<'SQL'
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated;
insert into auth.users values
 ('00000000-0000-4000-8000-000000000001', 'manager@example.com'),
 ('00000000-0000-4000-8000-000000000002', 'worker1@example.com'),
 ('00000000-0000-4000-8000-000000000003', 'worker2@example.com');
SQL
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres < "$project/supabase/migrations/202611060001_initial.sql"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres < "$project/supabase/seed.sql"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres < "$project/tests/rls.sql"
printf '%s\n' 'Migration, sample workflow and database security checks passed on isolated PostgreSQL 16.'
