#!/usr/bin/env bash
# Builds the website for Vercel: the landing pages from website/ at the root,
# and the Expo web build of the app under /app. Output: dist-site/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-site
cp -R website dist-site
WEB_BASE_URL=/app npx expo export --platform web --clear --output-dir dist-site/app
