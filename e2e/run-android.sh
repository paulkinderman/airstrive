#!/usr/bin/env bash
# Runs inside the emulator step of .github/workflows/e2e.yml (or on your own machine with an
# emulator or phone attached and the debug APK built): serves the JS with Metro, installs the
# app and runs the Maestro flows. The app is built without Supabase keys, so it offers the
# dev-only "this phone only" mode and never talks to a server.
set -euo pipefail
cd "$(dirname "$0")/.."
out="${E2E_OUT:-e2e/out}"
mkdir -p "$out"

CI=1 npx expo start --port 8081 >"$out/metro.log" 2>&1 &
metro=$!
trap 'kill $metro 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf http://localhost:8081/status >/dev/null && break; sleep 2; done

adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081
# Build the bundle once before the app asks, so the first screen doesn't time out.
curl -sf "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false" -o /dev/null || true

maestro="$HOME/.maestro/bin/maestro"
if ! "$maestro" test e2e/maestro --format junit --output "$out/report.xml" --test-output-dir "$out"; then
  # Print what was on screen when it stopped, so a failure can be read from the log alone.
  echo "::group::Screen at failure"
  "$maestro" hierarchy 2>/dev/null | grep -oE '"(text|accessibilityText|resource-id)" *: *"[^"]+"' | head -150 || true
  echo "::endgroup::"
  exit 1
fi
