# AirStrive on Alexa

An Alexa skill for the Echo Show: the moments friends share with you, a photo show, and your
own grids with Next up. It only reads, and sees exactly what the app shows the linked person.

- `supabase/functions/alexa/` is the endpoint: `index.ts` checks each request came from Alexa
  (`verify.ts`) and reads AirStrive with the linked person's token; `skill.ts` decides what to
  say; `apl.ts` draws the screens. Tests: `test/alexa.test.ts`.
- `supabase/migrations/20261030060000_echo_show.sql` adds `echo_shelf()`, the grids and boards.
- `app/oauth/consent.tsx` is the "Let Alexa show your AirStrive?" page in the web app, where
  account linking lands after Supabase's OAuth server.
- `skill-package/` is the skill's manifest and voice model, for the Alexa developer console or
  the ASK CLI (`ask deploy`).

Below, "prod" is the `airstrive-prod` Supabase project (`vgibkjwfdiuorrbykvlr`). Do the same on
`airstrive-dev` first if you want to try it there; change the URLs to its ref.

## 1. Supabase

1. **Authentication → URL Configuration.** Site URL is `https://airstrive.vercel.app`.
2. **Authentication → OAuth Server.** Turn it on. Authorization Path: `/app/oauth/consent`.
3. Deploy:
   ```sh
   supabase link --project-ref vgibkjwfdiuorrbykvlr
   supabase db push
   supabase functions deploy alexa --no-verify-jwt
   ```
4. Deploy the website (merging to main does it), so `/app/oauth/consent`, the icons and the
   updated privacy page are live.

## 2. Amazon

1. Make a free account at [developer.amazon.com](https://developer.amazon.com), ideally with the
   Amazon login your own Echo uses, so you can test on it.
2. **Alexa Developer Console → Create Skill.** Name `AirStrive`, English (US), Other → Custom →
   Provision your own, Start from scratch.
3. **Build → Interaction Model → JSON Editor.** Paste `skill-package/interactionModels/custom/en-US.json`,
   then Save and Build.
4. **Build → Interfaces.** Turn on Alexa Presentation Language and tick Hub Round and Hub
   Landscape (every size). Save.
5. **Build → Endpoint.** HTTPS. Default region:
   `https://vgibkjwfdiuorrbykvlr.supabase.co/functions/v1/alexa`, certificate option "My
   development endpoint is a sub-domain of a domain that has a wildcard certificate". Save, and
   copy the **Skill ID** at the top of that page:
   ```sh
   supabase secrets set ALEXA_SKILL_ID=amzn1.ask.skill.xxxx --project-ref vgibkjwfdiuorrbykvlr
   ```
6. **Build → Account Linking.** Turn on "Do you allow users to create an account or link to an
   existing account with you?". Leave "Allow users to enable skill without account linking" off.
   - Grant type: Auth Code Grant
   - Web Authorization URI: `https://vgibkjwfdiuorrbykvlr.supabase.co/auth/v1/oauth/authorize`
   - Access Token URI: `https://vgibkjwfdiuorrbykvlr.supabase.co/auth/v1/oauth/token`
   - Your Client ID and Secret: from step 7 (come back and fill them in)
   - Authentication scheme: HTTP Basic
   - Scope: `email`
   - Domain list: `airstrive.vercel.app`, `accounts.google.com`
   - PKCE: on (Supabase requires it)

   At the bottom are three **Alexa Redirect URLs**. Copy them.
7. Back in Supabase, **Authentication → OAuth Apps → Add a new client.** Name `Alexa`, type
   Confidential, redirect URIs: the three URLs from step 6. Copy the Client ID and Secret (the
   secret is shown once) into Alexa's Account Linking page and save.

## 3. Try it

- **Test tab:** set "Skill testing is enabled in" to Development. Your Echo signed in to the
  same Amazon account now has the skill: in the Alexa app, More → Skills & Games → Your Skills →
  Dev → AirStrive → Enable, and sign in. Then "Alexa, open air strive".
- **Your parents, before the store:** Distribution → Availability → Beta Test, and add the email
  of their Amazon account. Amazon emails them a link to enable it. Up to 500 testers, 90 days.

Signing in happens in the web app, which offers Google and an emailed code (no Apple on the
web). Someone who joined with Sign in with Apple can use the emailed code with their Apple ID's
email; with "Hide My Email", it's the relay address in their Apple ID settings.

## 4. Publish

1. **Distribution → Skill Preview.** Copy the text, phrases and keywords from
   `skill-package/skill.json`. Icons: `https://airstrive.vercel.app/alexa-icon-108.png` and
   `https://airstrive.vercel.app/alexa-icon-512.png`. Category: Social Networking. Privacy
   policy: `https://airstrive.vercel.app/privacy`.
2. **Privacy & Compliance:** no purchases, no personal information beyond the linked account
   (the skill doesn't ask Amazon for name, address or the like), not for children, no ads.
3. **Testing instructions:** a test account the reviewers can sign in to, with friends who have
   shared photos and a grid with Next up. The web app signs in with Google or an emailed code,
   and reviewers can't read your inbox, so the simplest is a Google account made just for
   review, with its password in the notes. Google sometimes asks a new device for a
   verification step; if Amazon reports that, an email-and-password sign-in for the review
   account is the fallback.
4. **Certification → Validation, then Functional test, then Submit for review.** Answers usually
   come in a few business days.
