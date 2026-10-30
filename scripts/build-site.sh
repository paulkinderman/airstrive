#!/usr/bin/env bash
# Builds the website for Vercel: the landing pages from website/ at the root,
# and the Expo web build of the app under /app. Output: dist-site/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-site
cp -R website dist-site
WEB_BASE_URL=/app npx expo export --platform web --clear --output-dir dist-site/app
# Expo only writes a favicon link into the app's page; add the touch icon the site serves.
sed -i.bak 's|</head>|<link rel="apple-touch-icon" href="/apple-touch-icon.png"/></head>|' dist-site/app/index.html
rm dist-site/app/index.html.bak
