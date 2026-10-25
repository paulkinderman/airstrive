# AirStrive Admin

A small static Next.js site for moderating grids people share to the Atlas: open reports,
shared grids, and people's sharing status. Everything runs in the browser with the anon key
and the admin's own session. The database decides who is an admin (`public.is_admin()`), and
every action goes through an `admin_*` RPC that checks it. There is no service role key.

Rule the RPCs enforce: hiding a grid closes its open reports, and **two hides on the same
person within 30 days suspends their sharing automatically**. Unhiding a grid does not lift a
suspension; use Restore sharing on the People tab.

## Run locally

```sh
cd admin
cp .env.example .env.local   # fill in the same project URL and anon key the app uses
npm install
npm run dev                  # http://localhost:3000
```

`npm run build` writes a static site to `out/`. `npm run typecheck` type-checks it.

## Deploy

Any static host works. On Vercel: import the repo, set **Root Directory** to `admin`, add
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables, and
deploy. Elsewhere, run `npm run build` with those variables set and upload `out/`.

## Supabase setup

1. **The admin needs an email sign-in on the same project.** Sign-in is a magic link with
   `shouldCreateUser: false`, so it refuses unknown emails. If the person only uses Apple or
   Google in the app, create the email user under **Authentication > Users > Add user**
   (that also creates their `public.users` row).
2. **Make them an admin.** In the SQL editor:

   ```sql
   update public.users set is_admin = true
   where id = (select id from auth.users where email = 'someone@example.com');
   ```

   To revoke, set it back to `false`.
3. **Allow the redirect.** Under **Authentication > URL Configuration > Redirect URLs**, add
   `http://localhost:3000` and the deployed URL (for example `https://your-admin.vercel.app`).
   Without it the link sends people to the project's Site URL instead.

Open the magic link in the same browser you requested it from (the sign-in uses PKCE).
