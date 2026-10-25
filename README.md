# AirStrive

Moments over metrics. Fill in grids of small experiences, one square at a time, and keep the photos and words as a scrapbook.

This is **v1**: Sign in with Apple (and Google, once configured), all six starter grids on the home shelf, sync between phones through Supabase, the chapter cover when a grid is finished, and export and account deletion in Settings. The phone's SQLite database stays the source of truth, so everything works offline.

## Run it on your phone

1. Install the **Expo Go** app from the App Store or Google Play.
2. On your computer, with Node 20 or newer:
   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

Sign-in needs a development build: Expo Go doesn't include Sign in with Apple's entitlement or Google's native module. Build a development client once:

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

In the Supabase dashboard, enable the Apple provider (client id `app.airstrive.mobile`) and, if used, Google (web client id, with the iOS client id under authorized client ids).

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
  (tabs)/atlas.tsx           placeholder until v2
  grid/[id].tsx              the board, tiles, bottom sheet, freebies
  moment/[squareId].tsx      log or edit a moment (photos, journal, date, chips)
  lane/[momentId].tsx        scrapbook page with polaroids and handwriting
  lane/chapter/[userGridId]  chapter cover: the finished mosaic, print as poster
  settings.tsx               backup status, export, sign out, delete account
src/
  data/                      the six starter grids (424 prompts), sizes, placement, seeding
  db/schema.ts               SQLite schema and upgrades (v0 phones upgrade in place)
  db/repo.ts                 reads and writes: shelf, board, moments, freebies, pages
  db/queue.ts                the sync queue: one entry per changed row
  sync/engine.ts             push, pull, photo upload and download, conflict rules
  sync/SyncProvider.tsx      when to sync: launch, foreground, network back, after writes
  auth/AuthProvider.tsx      Apple / Google sign-in, username, sign-out, deletion
  lib/exportData.ts          the export zip: moments.json, photos/, memory-lane.pdf
  lib/printables.ts          HTML for the poster and the scrapbook PDF
supabase/
  migrations/                tables, row-level security, triggers, starter grid seed
  functions/delete-account   deletes photos, rows and the auth user
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

## Sync

- Every write marks its rows in `sync_queue` in the same transaction. The pusher sends the row as it is at push time, parents before children, a batch per table, and retries with backoff (1 s, 10 s, 1 min, 10 min, then hourly). After seven days of failures a change is marked as couldn't sync, and Settings offers Try again.
- Pulls page through each table by the server's own `server_updated_at`, starting two minutes before the last cursor.
- The newer `updated_at` wins per row; a deleted row stays deleted; a row with queued local changes is never overwritten by a pull. These rules hold on both the phone and in Postgres triggers.
- Starter grids get ids derived from the person and the grid, so two phones that both start the shelf before syncing make the same rows.
- If two phones log the same square while offline, the newer moment is kept and the other is deleted.
- Photos upload to the private `photos` bucket at `{user_id}/{photo_id}.webp`, and other phones download them on the next sync. Photo paths are stored relative to the documents folder.
- Signing out empties the phone. Signing in as someone else starts from an empty phone. Data made on v0 before any account is uploaded to the first account that signs in.
