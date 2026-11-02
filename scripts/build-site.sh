#!/usr/bin/env bash
# Builds the website for Vercel: the landing pages from website/ at the root,
# and the Expo web build of the app under /app. Output: dist-site/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist-site
cp -R website dist-site
# What the share-link pages (website/invite.js) need: the Supabase project to preview a link
# with (the anon key is already public in the app), and the App Store link once there is one.
node -e '
  const c = { supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "", anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
              appStoreUrl: process.env.EXPO_PUBLIC_APP_STORE_URL || "" };
  process.stdout.write("window.AIRSTRIVE = " + JSON.stringify(c) + ";\n");
' > dist-site/config.js
WEB_BASE_URL=/app npx expo export --platform web --clear --output-dir dist-site/app
# Expo only writes a favicon link into the app's page; add the touch icon the site serves.
sed -i.bak 's|</head>|<link rel="apple-touch-icon" href="/apple-touch-icon.png"/></head>|' dist-site/app/index.html
rm dist-site/app/index.html.bak
