#!/usr/bin/env bash
# Runs the integration tests against a local Supabase in Docker. Never points at dev or production.
#   npx supabase start   (once; needs Docker)
#   npm run test:integration
set -euo pipefail
cd "$(dirname "$0")/../.."
eval "$(npx -y supabase@2.122.0 status -o env | sed -n 's/^\(API_URL\|ANON_KEY\|SERVICE_ROLE_KEY\)=/export SB_\1=/p')"
export SUPABASE_URL="${SB_API_URL:?is supabase start running?}" SUPABASE_ANON_KEY="$SB_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SB_SERVICE_ROLE_KEY"
TSX_TSCONFIG_PATH=test/integration/tsconfig.json node --no-warnings --import tsx --test --test-concurrency=1 test/integration/*.test.ts
