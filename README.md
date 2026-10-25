# AirStrive

Moments over metrics. Fill in grids of small experiences, one square at a time, and keep the photos and words as a scrapbook.

This is **v0**: one grid (Running), the log-a-moment sheet with photos and a journal, and Memory Lane. Everything is stored on the phone in SQLite. No accounts, no network.

## Run it on your phone

1. Install the **Expo Go** app from the App Store or Google Play.
2. On your computer, with Node 20 or newer:
   ```sh
   npm install
   npx expo start
   ```
3. Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

Photos use the camera and photo library, which work in Expo Go. For a real install on your own phone (and for the WebP compression path), build a development client once:

```sh
npx expo run:ios      # needs Xcode on a Mac
npx expo run:android  # needs Android Studio
```

## What's here

```
app/                    screens (expo-router)
  (tabs)/index.tsx      home shelf: greeting, things to try, your grids
  (tabs)/lane.tsx       Memory Lane index
  (tabs)/atlas.tsx      placeholder until v2
  grid/[id].tsx         the board, tiles, bottom sheet, freebies
  moment/[squareId].tsx log or edit a moment (photos, journal, date, chips)
  lane/[momentId].tsx   scrapbook page with polaroids and handwriting
src/
  data/running.ts       the 80 Running prompts in 8 clusters
  data/types.ts         sizes, starting squares, neighbour rule, cluster placement
  data/seed.ts          seeds the grid and starts it on first launch
  db/schema.ts          SQLite schema (matches the build plan's data model)
  db/repo.ts            all reads and writes: shelf, board, moments, freebies
  lib/photos.ts         pick/take photos, resize to 1600 px, store in app files
  ui/Tile.tsx           the living tile with photo crossfade
  theme/                colors and fonts from the design canvas
```

## Rules as implemented

- A grid starts with its centre squares revealed; completing a square reveals its four orthogonal neighbours.
- A square is done when a moment is saved for it. Deleting the moment returns it to revealed; neighbours stay revealed.
- Freebies complete a revealed square without a moment and do not refill (1 / 2 / 4 / 6 by size).
- Done tiles show the moment's cover photo; with several photos they drift between them on a nine-second cycle.
- Every write also lands in `sync_queue`, ready for the Supabase sync worker in v1.

## Next (v1)

Accounts and sync, the home shelf with the other five starter grids, the chapter cover on completion, account deletion and export.
