#!/usr/bin/env bash
# Regenerates src/db/database.types.ts from a Supabase project after a migration.
#   SUPABASE_PROJECT_REF=<dev project ref> npm run gen:types
# Needs the Supabase CLI to be logged in (supabase login) or SUPABASE_ACCESS_TOKEN set.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the project to read the schema from (use dev).}"
out=src/db/database.types.ts
{
  echo '// Generated from the Supabase schema (supabase gen types typescript). Do not edit by hand.'
  echo '// Regenerate after a migration: npm run gen:types (needs SUPABASE_PROJECT_REF and a logged-in Supabase CLI).'
  echo
  npx -y supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" --schema public
} > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out"
