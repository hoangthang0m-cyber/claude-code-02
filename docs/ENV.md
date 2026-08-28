# Environment variables

Implementation notes for the Content Performance Tracker (`docs/SPEC.md`).
Secrets live in `.env.local` (git-ignored). This file only lists the keys and
what they are for; it is updated as each checklist group introduces new ones.

## Firebase — client (already present)

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Web SDK config (reads via `onSnapshot`, Auth, Storage). |

## Firebase — Admin SDK (group 7.1)

Server-side auth (`/api/me`, group 1.4) and every mutation from group 7.2 on go
through route handlers using `firebase-admin`. **Required** — without these,
`/api/*` handlers return 500.

Get the key from the Firebase console → Project Settings → Service Accounts →
"Generate new private key". This is a **different** credential from the existing
`GOOGLE_*` service account (that one is a different GCP project and is being
replaced by manager OAuth per SPEC §6.3).

| Key | Purpose |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | Must equal `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service-account client email. |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service-account private key. Newlines may be `\n`-escaped. |

## Token encryption (group 7.1)

**Required from group 7.5 on.** Without it, connecting an ad account (and later
Google Sheets) fails at the encrypt step.

| Key | Purpose |
|---|---|
| `TOKEN_ENC_KEY` | Base64 of a 32-byte key for AES-256-GCM encryption of third-party tokens at rest (SPEC §1.5). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Set a different value on Vercel** — rotating it makes every stored token undecryptable, so pick once per environment. |

## Meta Ads OAuth (group 7.5, task 5.1)

The Ad Account connect flow (`/ad-accounts`) reuses the Facebook app credentials
already in `.env.local`. The OAuth redirect URI is derived from the request
origin at runtime — there is no env var for it — so **register both of these in
the Meta app** (App Dashboard → Facebook Login → Settings → *Valid OAuth Redirect
URIs*):

- `http://localhost:3000/api/ad-accounts/meta/callback`
- `https://claude-code-02.vercel.app/api/ad-accounts/meta/callback`

The app also needs the **`ads_read`** permission (App Review, or add the manager
as a test user / app role while unreviewed).

| Key | Purpose |
|---|---|
| `FACEBOOK_APP_ID` | Meta app id — the OAuth `client_id`. |
| `FACEBOOK_APP_SECRET` | Meta app secret — used server-side for the code→token and long-lived-token exchanges. |

`FACEBOOK_ACCESS_TOKEN` (a single static token) belongs to the old `/reports`
screen and is removed when group 7.8 replaces it.

## Background jobs (group 7.5, task 5.2)

| Key | Purpose |
|---|---|
| `CRON_SECRET` | Guards the `/api/jobs/**` handlers. Vercel Cron (see `vercel.json`) sends it as `Authorization: Bearer <CRON_SECRET>` automatically once the env var is set on the project; a manual run uses the same header. Generate: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`. Set a different value on Vercel. |

Cron jobs so far:
- `meta-token-refresh` — daily 03:00 UTC; renews Meta long-lived tokens, flips
  dead ones to `needs_reconnect`.
- `ads-sync` — hourly; appends an `AdsMetric` (`source=synced`) per content item
  with an active AdsBinding that is due (6h / 12h / 24h cadence).
- `sheets-sync` — every 5 min; two-way Google Sheets sync for every project with
  a mapping (task 6.3 = system → sheet; 6.4 adds sheet → system).

## Google Sheets OAuth (group 7.6, task 6.1)

The manager connects their own Google account (SPEC §6.3 — **not** a service
account). Refresh token stored AES-256-GCM encrypted in `googleConnections/{uid}`.
The redirect URI is derived from the request origin at runtime, so **register
both of these** in the Google Cloud OAuth client (Web application):

- `http://localhost:3000/api/google/connect/callback`
- `https://claude-code-02.vercel.app/api/google/connect/callback`

Enable **Google Sheets API** + **Google Drive API** on the project, and add the
manager as a **Test user** on the OAuth consent screen (scopes: `spreadsheets`,
`drive.metadata.readonly`, `openid`, `email`).

| Key | Purpose |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 Web client id. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 Web client secret (server-side token exchange). |

`GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_PROJECT_ID` belong
to the old service-account approach and are removed when group 7.8 lands.

## `firestore.rules`

Task 6.1 adds a locked `match /googleConnections/{uid}` block (`read, write: if
false`) — **redeploy the rules** (`npm run rules:deploy` or paste in the console).
