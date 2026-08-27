# Environment variables

Implementation notes for the Content Performance Tracker (`docs/SPEC.md`).
Secrets live in `.env.local` (git-ignored). This file only lists the keys and
what they are for; it is updated as each checklist group introduces new ones.

## Firebase — client (already present)

| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase Web SDK config (reads via `onSnapshot`, Auth, Storage). |

## Firebase — Admin SDK (group 7.1)

Server-side writes go through route handlers using `firebase-admin`.

| Key | Purpose |
|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | Service-account project id (same Firebase project). |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service-account client email. |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service-account private key. Newlines may be `\n`-escaped. |

## Token encryption (group 7.1)

| Key | Purpose |
|---|---|
| `TOKEN_ENC_KEY` | Base64 of a 32-byte key for AES-256-GCM encryption of third-party tokens at rest (SPEC §1.5). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |

## Later groups (not yet wired)

| Key | Introduced in | Purpose |
|---|---|---|
| `CRON_SECRET` | 7.6 / 7.5 | Shared secret guarding `/api/jobs/**` cron endpoints. |
| `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI` | 7.5 | Meta OAuth for per-project Ad Account connections (replaces the single static `FACEBOOK_ACCESS_TOKEN`). |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | 7.6 | Google OAuth using the manager's refresh token for Sheets — **not** a service account (SPEC §6.3). Replaces `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`. |
