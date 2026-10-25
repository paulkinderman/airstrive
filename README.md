# AirStrive

Moments over metrics. Fill in grids of small experiences, one square at a time, and keep the photos and words as a scrapbook.

This is **v2**: everything in v1 (Sign in with Apple, sync between phones through Supabase, the chapter cover, export and account deletion) plus the Atlas:

- **Onboarding.** After the username, a new profile picks a few interests, sees the Atlas categories that match, and adds as many grids as it likes before reaching the shelf. v1 accounts with no moments yet go through it too; accounts with moments keep their shelf.
- **Atlas.** Search, a "This season" strip, rows by theme, and a preview of each grid (a peek at the board and its first squares) with Add, Copy and edit, and Report.
- **Make your own.** Name, color, size and theme, write the squares you care about, and "Suggest the rest" fills the gaps from a reviewed bank of about 1,500 prompts bundled in the app (no model, no network). Your own squares go in the middle so they are revealed first.
- **Share to the Atlas**, stop sharing, and remove a grid from your shelf (only grids with no moments).
- **Moderation.** Reports, and a small admin site in `admin/` to hide grids and suspend sharing. Two hides in 30 days suspends sharing automatically.

The phone's SQLite database stays the source of truth, so everything works offline; the Atlas shows what it last fetched.

## Run it on your phone

1. Install the **Expo Go** app from the App Store or Google Play.
2. On your computer, with Node 20 or newer:
   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

Everything in v1 runs in Expo Go on an iPhone, including Sign in with Apple, as long as Expo Go's bundle id `host.exp.Exponent` is listed as an Apple client id in Supabase. Google sign-in is the one exception: it needs a development build, and its button stays hidden in Expo Go. To make a development build:

```sh
npx expo run:ios      # needs Xcode on a Mac
npx expo run:android  # needs Android Studio
```

## Configure

Copy `.env.example` to `.env` and fill in the Supabase URL and anon (publishable) key. Leave the Google ids blank for Apple-only on iOS. Without a `.env`, a development build offers "Continue on this phone only" so the app can be tried with no backend.

Backend, once per Supabase project:

```sh
supabase link --project-ref <ref>
supabase db push                          # supabase/migrations
supabase functions deploy delete-account
```

The admin site has its own setup; see [admin/README.md](admin/README.md).

In the Supabase dashboard, enable the Apple provider (client id `app.airstrive.mobile`) and, if used, Google (web client id, with the iOS client id under authorized client ids).

## Website and web app

The website is the landing page and privacy page in `website/`, plus the same app built for the browser at `/app`. On the web, photos live in IndexedDB and SQLite runs as WebAssembly, so it works offline like the phone app and syncs through the same Supabase account. On the web you sign in with Google or with a code sent by email. Sign in with Apple on the web needs a paid Apple Developer account.

```sh
npm run build:site    # writes dist-site/: website/ at the root, the app under /app
```

`vercel.json` deploys it on Vercel's free plan:

1. In Vercel, import the GitHub repo. The build settings come from `vercel.json`.
2. Under Settings → Environment Variables, add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. In Supabase → Authentication → URL Configuration, add `https://<your-domain>/app/**` (and `http://localhost:8081/**` for development) to the redirect URLs.
4. In Supabase → Authentication → Providers → Google, turn Google on with a Google Cloud web client id and secret. In Google Cloud, add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
5. So Google's account picker names your site rather than the Supabase project, also add `https://<your-domain>/auth` as an authorized redirect URI on the same Google client (`website/auth.html` hands the answer to the app; add `http://localhost:8081/` too for development), and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in Vercel. Without that variable the site signs in through Supabase as in step 4.
6. Email sign-in sends a 6-digit code. In Supabase → Authentication → Emails, add `{{ .Token }}` to the Magic Link template. Supabase's built-in mailer only reaches the project's team members, so set up custom SMTP before anyone else signs in by email.

Vercel Web Analytics counts page views on the website and the web app (cookieless; turn it on in the Vercel project's Analytics tab). The phone app has none.

On a computer screen (at least 960 px wide) a few screens switch to wide layouts from `src/wide/`. The grid page shows the board beside a panel for the selected square, with hover previews and arrow keys. Mosaic mode shows the whole grid on a dark wall. Memory Lane pages open as a two-page book. Every other screen stays in a phone-width column. `useWideLayout()` in `src/ui/wide.web.ts` decides which layout to use, and it is always false on phones.

The app pages need `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (expo-sqlite uses SharedArrayBuffer). `vercel.json` sends them for `/app`, and `metro.config.js` does the same for `npx expo start --web`.

## Tests

```sh
npm run typecheck   # app and tests
npm test            # repo rules and two-phone sync, on Node 22's built-in SQLite
npm run test:db     # migrations, RLS and last-write-wins on a throwaway Postgres (PGHOST/PGPORT)
```

## What's here

```
app/                         screens (expo-router)
  welcome.tsx, username.tsx  sign-in and picking a name
  (tabs)/index.tsx           home shelf: greeting, things to try, your grids
  (tabs)/lane.tsx            Memory Lane index, moments and chapter covers
  onboarding/                interests, then suggested grids to add
  (tabs)/atlas.tsx           the Atlas: search, this season, rows by theme
  atlas/[gridId].tsx         grid preview: add, copy and edit, report
  make.tsx                   make your own, with Suggest the rest
  report/[gridId].tsx        report a shared grid
  grid/[id].tsx              the board, tiles, bottom sheet, freebies
  moment/[squareId].tsx      log or edit a moment (photos, journal, date, chips)
  lane/[momentId].tsx        scrapbook page with polaroids and handwriting
  lane/chapter/[userGridId]  chapter cover: the finished mosaic, print as poster
  settings.tsx               backup status, export, sign out, delete account
src/
  data/                      the six starter grids (424 prompts), sizes, placement, seeding, adopting
  atlas/                     themes and interests, picks, the Atlas catalog, the preview
  suggest/                   the reviewed prompt bank and Suggest the rest
  db/schema.ts               SQLite schema and upgrades (v0 phones upgrade in place)
  db/repo.ts                 reads and writes: shelf, board, moments, freebies, pages
  db/queue.ts                the sync queue: one entry per changed row
  sync/engine.ts             push, pull, photo upload and download, conflict rules
  sync/SyncProvider.tsx      when to sync: launch, foreground, network back, after writes
  auth/AuthProvider.tsx      Apple / Google / email sign-in, username, sign-out, deletion
  lib/exportData.ts          the export zip: moments.json, photos/, memory-lane.pdf
  lib/printables.ts          HTML for the poster and the scrapbook PDF
  lib/*.web.ts               browser versions: photos in IndexedDB, printing and downloads, dialogs
website/                     landing page and privacy page (static HTML)
supabase/
  migrations/                tables, row-level security, triggers, starter grid seed
  functions/delete-account   deletes photos, rows and the auth user
admin/                       Next.js admin site: reports, hide grids, suspend sharing
  tests/                     SQL checks for RLS and sync rules
test/                        node --test suites and a fake server
scripts/starter-sql.ts       regenerates the starter grid seed from src/data
```

## Rules as implemented

- A grid starts with its centre squares revealed; completing a square reveals its four orthogonal neighbours.
- A square is done when a moment is saved for it. Deleting the moment returns it to revealed; neighbours stay revealed.
- Freebies complete a revealed square without a moment and do not refill (1 / 2 / 4 / 6 by size).
- Done tiles show the moment's cover photo; with several photos they drift between them on a nine-second cycle.
- When every square is done, a chapter cover joins Memory Lane. Removing a moment from a finished grid takes it away again.
- A grid someone makes is private until they share it. Its squares are fixed once it is saved, so everyone who adds it plays the same board; the title, color, theme, description and sharing can still change.
- Stopping sharing or hiding a grid takes it out of the Atlas; people who already added it keep it.

## Sync

- Every write marks its rows in `sync_queue` in the same transaction. The pusher sends the row as it is at push time, parents before children, a batch per table, and retries with backoff (1 s, 10 s, 1 min, 10 min, then hourly). After seven days of failures a change is marked as couldn't sync, and Settings offers Try again.
- Pulls page through each table by the server's own `server_updated_at`, starting two minutes before the last cursor.
- The newer `updated_at` wins per row; a deleted row stays deleted; a row with queued local changes is never overwritten by a pull. These rules hold on both the phone and in Postgres triggers.
- Starter grids get ids derived from the person and the grid, so two phones that both start the shelf before syncing make the same rows.
- If two phones log the same square while offline, the newer moment is kept and the other is deleted.
- Grids people make are queued like everything else and saved through `save_grid()` before any other rows, one call per grid. A grid that won't save is retried without holding up the rest. Sharing while sharing is suspended saves the grid as private.
- Interests from onboarding are kept on the phone and sent with the next sync.
- Photos upload to the private `photos` bucket at `{user_id}/{photo_id}.webp`, and other phones download them on the next sync. Photo paths are stored relative to the documents folder.
- Signing out empties the phone. Signing in as someone else starts from an empty phone. Data made on v0 before any account is uploaded to the first account that signs in.
