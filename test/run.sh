#!/usr/bin/env bash
# Unit and two-phone sync tests on Node's built-in SQLite.
set -euo pipefail
cd "$(dirname "$0")/.."
TSX_TSCONFIG_PATH=test/tsconfig.json node --no-warnings --import tsx --test test/*.test.ts
# Export zip on a real temp folder, with its own file-system and printer stand-ins.
TSX_TSCONFIG_PATH=test/export/tsconfig.json node --no-warnings --import tsx --test test/export/*.test.ts
