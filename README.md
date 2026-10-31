# AirStrive

Moments over metrics. Fill in grids of small experiences, one square at a time, and keep the photos and words as a scrapbook.

This is **v2**: everything in v1 (Sign in with Apple, sync between phones through Supabase, the chapter cover, export and account deletion) plus the Atlas:

- **Onboarding.** After the username, a new profile picks a few interests, sees the Atlas categories that match, and adds as many grids as it likes before reaching the shelf. v1 accounts with no moments yet go through it too; accounts with moments keep their shelf.
- **Atlas.** Search, a "This season" strip, rows by theme, and a preview of each grid (a peek at the board and its first squares) with Add, Copy and edit, and Report.
- **Make your own.** Name, color, size and theme, write the squares you care about, and "Suggest the rest" fills the gaps from a reviewed bank of about 1,500 prompts bundled in the app (no model, no network). Your own squares go in the middle so they are revealed first.
- **Share to the Atlas**, stop sharing, and remove a grid from your shelf (only grids with no moments).
- **Moderation.** Reports, and a small admin site in `admin/` to hide grids and suspend sharing. Two hides in 30 days suspends sharing automatically.

And friends:

- **Profile tab.** Your username, a profile picture (seen only by friends and the people you do grids with), a line about you, the grids you share, your friends and friend requests, and Settings.
- **Friends** are mutual. Add someone by searching their username (three letters or more) and sending a request, or in person with your QR code or a link (each works once; links last 7 days). Remove and block are silent.
- **Audiences.** Every grid is Private, Friends or Public (anyone on AirStrive who opens your profile), and each moment in it can match the grid or be narrower. Everything starts Private. Place, weather and who you were with are never shown to anyone else.
- **Someone's profile** shows the grids that reach you, read-only, with the moments you're allowed to see. There's no feed, and nothing is counted or ranked.
- **Reports** on moments and people, beside grid reports in the admin site, which can hide a moment or suspend someone's sharing.

And grids done together:

- **Do this together** from a grid's menu, or from a grid in the Atlas, makes a group grid and invites friends to it. Invites show on the Profile tab. There's no limit on group size.
- **One shared board.** Anyone in the group can do any square. Each square holds one moment: its title, date, place, weather and who with are shared and anyone can edit them; each person adds their own words and photos.
- **Group or Private.** Each person's words, and each photo, are seen by the group or kept to themselves. A square done with only Private words still shows as done to everyone.
- **Only the group.** A group grid never shows on profiles or to other friends. Its template can still be shared to the Atlas.
- **Leaving** takes the grid off your shelf and leaves what you shared for the others. When the last person leaves, the grid is deleted.

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
supabase db push                          # supabase/migrations (then npm run gen:types to refresh src/db/database.types.ts)
supabase functions deploy delete-account
```

Push notifications (once per project; until then notifications still show in the app, only the pushes are skipped):

```sh
supabase functions deploy send-push --no-verify-jwt
```

and in the SQL editor (the secret is made in the database and never leaves it):

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_secret');
```

Pushes go through Expo's push service, which needs the APNs key: enable Push Notifications on the App IDs `app.airstrive.mobile` and `app.airstrive.mobile.preview` in the Apple Developer portal, then `eas credentials -p ios` → the profile → Push Notifications → set up a push key.

The admin site has its own setup; see [admin/README.md](admin/README.md).

In the Supabase dashboard, enable the Apple provider (client id `app.airstrive.mobile`) and, if used, Google (web client id, with the iOS client id under authorized client ids).

## Release to the App Store

Every merge to `main` that touches the app builds for iOS on EAS and uploads the build to App Store Connect, where it reaches TestFlight's internal testers (`.github/workflows/testflight.yml`). Nothing goes to App Store review by itself: you pick a TestFlight build in App Store Connect and submit it. `eas.json` names the App Store Connect app by its Apple ID (`submit.production.ios.ascAppId`). Changes only to the website, admin site, Supabase or docs don't start a build, and Actions → TestFlight → Run workflow starts one by hand.

`eas.json` has three iOS profiles:

| Profile | Supabase | What it's for |
| --- | --- | --- |
| `production` | production | TestFlight and the store. EAS keeps the build number and bumps it on every build; the marketing version is `version` in `app.json`. |
| `preview` | dev | Trying unfinished work on your phone. It's "AirStrive Preview" (`app.airstrive.mobile.preview`, its own App Group and `airstrive-preview://` scheme), so it installs beside the TestFlight app without sharing its data. `eas build -p ios --profile preview`, installed from the link EAS gives you. |
| `development` | dev | A dev client for `npx expo start`. |

Each profile reads its environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, the Google client ids, `EXPO_PUBLIC_FLAGS`) from the matching environment on expo.dev. Sign in with Google needs an iOS client id for `app.airstrive.mobile.preview` before it works in the preview app; leave it out there and the preview app signs in with Apple only. Add `app.airstrive.mobile.preview` to the dev Supabase project's Apple client ids.

Feature flags (`src/lib/flags.ts`) keep unfinished work on `main` hidden: wrap it in `flag('name')`, list the name in `EXPO_PUBLIC_FLAGS` for the preview environment to try it, and for production when it's ready. `emailSignIn` shows "Continue with email" on iPhone; list it in an environment once that Supabase project has custom SMTP, since the built-in mailer only reaches the project's team (web and Android always show it).

One-time setup:

1. On expo.dev → the project → Environment variables, set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and the Google client ids for **production** (the production Supabase project) and for **preview** and **development** (the dev project).
2. Run `eas build --platform ios --profile production --auto-submit` once on your computer. It signs in to Apple, makes the certificates and provisioning profiles for the app and the widget, and offers to make an App Store Connect API key for submitting. Say yes to each; EAS keeps them, so later builds need no sign-in.
3. On expo.dev → Account settings → Access tokens, make a token, and add it to GitHub → Settings → Secrets and variables → Actions as `EXPO_TOKEN`.
4. In App Store Connect → TestFlight, make an internal testing group with yourself in it and turn on automatic distribution, so each new build reaches your phone.
5. For preview builds, register your iPhone once with `eas device:create`.

To release, open App Store Connect → the app → the version, choose a TestFlight build, and submit it for review.

The production Supabase project needs the same backend steps as above (`supabase db push`, `supabase functions deploy delete-account`, the Apple and Google providers). Its Apple client ids should be `app.airstrive.mobile` only: `host.exp.Exponent` is for Expo Go and doesn't belong in production.

`app.json` declares the privacy manifest (`ios.privacyManifests`), that the app uses no non-exempt encryption, and light and dark app icons. Settings links to the privacy policy and help pages on the website (`website/privacy.html`, `website/support.html`), which are also the URLs App Store Connect asks for.

## Home screen widgets (iOS)

Four widgets, written in SwiftUI in `targets/widget/` and added to the Xcode project by `@bacons/apple-targets` on prebuild: **Next up** (small and medium, a different open square each hour), **Lately** (small and medium, your newest photos as polaroids), **Your grids** (medium, four grids at a glance) and **Scrapbook** (large: Lately, Next up and what friends shared). Tapping one opens that square, moment or the shelf.

The app writes `widget.json` and small JPEGs of recent photos to the App Group `group.app.airstrive.mobile` after every edit or sync pull and when it comes to the front (`src/widgets/`), and asks iOS to redraw. Widgets need a development or store build (`eas build`), not Expo Go. EAS makes the widget's App ID (`app.airstrive.mobile.widget`), the App Group and its provisioning profile on the first build. To build in Xcode instead, set `ios.appleTeamId` in `app.json` and run `npx expo prebuild -p ios --clean`.

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
  settings.tsx               backup status, export, blocked people, sign out, delete account
  (tabs)/profile.tsx         Profile: bio, friends and requests, grids you share
  friends/                   add a friend (username search), my QR code and link, scan a code
  f/[code].tsx               where a friend link or scanned code lands, signed in or not
  people/[userId].tsx        someone's profile: add, accept, remove, block, report
  people/grid/[userGridId]   someone's grid, read-only, with the moments shared with you
  together/start.tsx         turns a grid into a group grid (needs a connection)
  together/[groupId].tsx     who's in a group grid: invite friends, cancel invites, leave
  report/moment, report/user report a moment or a person
src/
  data/                      the six starter grids (424 prompts), sizes, placement, seeding, adopting
  atlas/                     themes and interests, picks, the Atlas catalog, the preview
  suggest/                   the reviewed prompt bank and Suggest the rest
  friends/                   audiences, the friends and profile calls, QR codes, links
  groups/                    group grids: each person's part of a square, invites, leaving
  db/schema.ts               SQLite schema and upgrades (v0 phones upgrade in place)
  db/repo/                   reads and writes by area: shelf, board, moments, lane, grids
  db/queue.ts                the sync queue: one entry per changed row
  sync/engine.ts             push, pull, photo upload and download, conflict rules
  sync/tables.ts             the columns each synced table sends and receives
  db/database.types.ts       generated types for the Supabase tables and functions (npm run gen:types)
  sync/SyncProvider.tsx      when to sync: launch, foreground, network back, after writes
  auth/AuthProvider.tsx      Apple / Google / email sign-in, username, sign-out, deletion
  lib/exportData.ts          the export zip: moments.json, photos/, memory-lane.pdf
  lib/printables.ts          HTML for the poster and the scrapbook PDF
  widgets/                   what the home screen widgets show, written for them to read
  lib/*.web.ts               browser versions: photos in IndexedDB, printing and downloads, dialogs
targets/widget/              the iOS home screen widgets (SwiftUI), with the app's fonts
website/                     landing page, privacy page and the /f/<code> friend link page (static HTML)
supabase/
  migrations/                tables, row-level security, triggers, starter grid seed
  functions/delete-account   deletes photos, rows and the auth user; keeps what was shared to group grids
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
- Sharing a grid to the Atlas shares its squares. Who sees your moments is the grid's audience, set separately.
- A moment is seen as the narrower of its own audience and its grid's. Narrowing a grid narrows its moments; widening it asks whether to bring the moments along.
- Other people's grids and moments never enter the phone's database. They are read from the server when a screen opens, through functions that return only what the viewer may see; every check goes through `can_view()` in Postgres, and photo files are readable only while their moment is.
- A blocked pair can't find or see each other. A request to someone who blocked you looks sent but never arrives.
- Someone whose sharing is suspended reaches friends at most. Two hidden moments in 30 days suspends it automatically.
- A group grid is a `user_grids` row whose `group_id` is its own id; every row under it carries the same `group_id`, set by Postgres from the parent. Membership alone decides who reads it: the owner rules cover solo rows only, so someone who leaves loses access to what they added too, and it stays for the others.
- In a group grid anyone can change the board and a moment's shared details; only the author changes an entry or a photo. A group moment's own `body` is always empty; the words are in `moment_entries`.
- Deleting an account clears `user_id` on what it added to group grids (shown as "a former member"), deletes its Private entries and photos there, and moves its shared photo files to `groups/{group_id}/`.

## Sync

- Every write marks its rows in `sync_queue` in the same transaction. The pusher sends the row as it is at push time, parents before children, a batch per table, and retries with backoff (1 s, 10 s, 1 min, 10 min, then hourly). After seven days of failures a change is marked as couldn't sync, and Settings offers Try again.
- Pulls page through each table by the server's own `server_updated_at`, starting two minutes before the last cursor.
- The newer `updated_at` wins per row; a deleted row stays deleted; a row with queued local changes is never overwritten by a pull. These rules hold on both the phone and in Postgres triggers.
- Starter grids get ids derived from the person and the grid, so two phones that both start the shelf before syncing make the same rows.
- If two phones log the same square while offline, the newer moment is kept and the other is deleted. In a group grid the first moment is kept instead, and each phone moves its own person's entry and photos onto it, so nobody's part is lost.
- Group grids: each sync asks `my_groups()` which groups the person is in. A group just joined is fetched whole (its rows are older than the pull cursors); one just left is removed from the phone. `group_unshares` tells phones to drop an entry or photo someone made Private.
- When a grid becomes a group grid, the server's rewrite of its rows wins over the phone's copy, whatever the timestamps.
- Grids people make are queued like everything else and saved through `save_grid()` before any other rows, one call per grid. A grid that won't save is retried without holding up the rest. Sharing while sharing is suspended saves the grid as private.
- Interests from onboarding are kept on the phone and sent with the next sync.
- Photos upload to the private `photos` bucket at `{user_id}/{photo_id}.webp`, and other phones download them on the next sync. Photo paths are stored relative to the documents folder.
- Signing out empties the phone. Signing in as someone else starts from an empty phone. Data made on v0 before any account is uploaded to the first account that signs in.
