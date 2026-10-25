#!/usr/bin/env bash
# Runs the migrations and checks against a throwaway Postgres database.
#   PGHOST=... PGPORT=... supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="airstrive_test_$$"
psql -q -U postgres -c "create database $db" >/dev/null
trap 'psql -q -U postgres -c "drop database $db" >/dev/null' EXIT
run() { psql -q -v ON_ERROR_STOP=1 -U postgres -d "$db" -f "$1"; }
run "$here/supabase-stubs.sql"
for f in "$here"/../migrations/*.sql; do run "$f"; done
run "$here/rls_and_sync.sql"
