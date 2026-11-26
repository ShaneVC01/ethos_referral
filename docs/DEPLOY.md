# Deploying Ethos Referrals

Two deployments from one repository, on Cloudflare Pages. They never share a build output, so the public
form never ships app code, data or a service worker, and the staff app is never reachable without sign in.

| | Staff app | Public referral form |
|---|---|---|
| Hostname | `referrals.<domain>` | `refer.<domain>` |
| Pages project | `ethos-referrals` | `ethos-referrals-public` |
| Build command | `npm run build` | `npm run build:public` |
| Output directory | `dist` | `dist-public` |
| Entry | `index.html` (PWA, service worker) | `refer.html` copied to `index.html` (no PWA) |
| Data | Mock adapter now. Seed JSON from `npm run seed` is gitignored and never deployed to `refer.` | None. Calls the `public-referral-submit` Edge Function |
| Access | Cloudflare Access on the whole hostname | Open to the public, protected by Turnstile |
| Headers | `public/_headers` (CSP, HSTS, noindex) | Written by `vite.public.config.ts` (CSP allows Turnstile only) |

## 1. Staff app (`referrals.`)

1. In Cloudflare Pages, create the project `ethos-referrals` and connect the repository. Use the build command
   and output directory from the table above.
2. Build environment variables (Settings, Environment variables, Build):
   - `VITE_DATA_ADAPTER`: `mock` for the prototype, `supabase` once the adapter is implemented.
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: only when `supabase`. The anon key is public by design.
   - Never put the service role key in any `VITE_` variable. It is visible to every visitor.
   - Do not set the seed. `seed/*.json` is gitignored and must not be uploaded to Pages.
3. Custom domain: add `referrals.<domain>`.
4. Cloudflare Access: Zero Trust, Access, Applications, self-hosted application for the whole hostname
   `referrals.<domain>` (path `*`). Policy: allow only the Ethos staff group (identity provider group or email list).
   Set session duration to 8 hours or less. Access sits in front of the whole site, including `/manifest.webmanifest`
   and the service worker, so the PWA install only works for signed in staff. This is intended.
5. `public/_redirects` gives the single page app fallback. `public/_headers` gives the security headers.
   Check after deploy: `curl -sI https://referrals.<domain>/` should show `X-Frame-Options: DENY`,
   `X-Robots-Tag: noindex, nofollow, noarchive` and the CSP.

## 2. Public referral form (`refer.`)

1. Create a second Pages project `ethos-referrals-public` from the same repository.
2. Build command `npm run build:public`, output directory `dist-public`.
3. Build environment variables:
   - `VITE_TURNSTILE_SITE_KEY`: the Turnstile site key (public).
   - `VITE_REFERRAL_SUBMIT_URL`: the URL of `public-referral-submit`, for example
     `https://<project-ref>.supabase.co/functions/v1/public-referral-submit`.
4. Custom domain: `refer.<domain>`. No Access policy. The page must be reachable by anyone.
5. The build writes its own `_headers` (Turnstile origins plus `connect-src` for the Edge Function, which is
   `'self'` today). When the Supabase adapter goes live, add the Supabase origin to `connect-src` in
   `vite.public.config.ts`.
6. Turnstile: create a widget in Cloudflare, Turnstile, for `refer.<domain>` only. Put the site key in the
   build variable above. Put the secret key in Supabase secrets as `TURNSTILE_SECRET_KEY`, never in the repository.

## 3. Supabase (once the adapter is live)

- Apply migrations and functions as described in `supabase/README.md`.
- Set the Edge Function secrets listed there. Set `CLINIC_PUBLIC_PHONE` until the clinic phone is in the data model.
- Run `supabase db reset` against a dev project first. The SQL has not been run against a live project yet.

## 4. Checks before go live

- `npm run typecheck`, `npm run build`, `npm run build:public` all pass.
- Staff app: sign in through Access, install the PWA on a phone (Android and iOS), accept the update prompt on a
  new deploy, and confirm offline shell load.
- Public form: submit with Turnstile passing, then with it failing (the function must refuse). Confirm the
  reference number appears and no patient data is echoed.
- `curl -sI` both hostnames and check the security headers above.
- Confirm `refer.<domain>/manifest.webmanifest` is not cached by the staff service worker (the public build has none).

## Rollback

Pages keeps every deployment. Roll back from the deployment list in each project. Database migrations are not
rolled back automatically: add a new numbered migration to undo a change.
