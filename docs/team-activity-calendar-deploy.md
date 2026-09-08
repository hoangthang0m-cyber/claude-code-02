# Team Activity Calendar — deploy runbook (task 13.3)

Follows Mục C **Migration Plan**, adapted to this repo (no Cloud Functions —
spec doc answer #2; jobs run from `/api/jobs/**` on the GitHub Actions cron).

Firebase project: **`hem-manager`** (`.firebaserc` default). Do this once, in
order. It only adds calendar collections + rules — nothing existing changes
(Migration Plan "Rollback").

## 0. Prerequisites

- `firebase login` (or export `FIREBASE_TOKEN`) — the CLI is currently
  **not authenticated** in this workspace, so a human runs steps 1–2.
- `.env.local` must hold the Firebase **admin** credentials
  (`GOOGLE_APPLICATION_CREDENTIALS` or the inline `GOOGLE_*` service-account
  vars) for the seed/backfill scripts in step 3–4.
- Repo secrets for the cron (Settings → Secrets and variables → Actions):
  `APP_URL` = `https://claude-code-02.vercel.app` (no trailing slash),
  `CRON_SECRET` = the same value as the Vercel env var `CRON_SECRET`.

## 1. Deploy Security Rules + indexes

```bash
npx --yes firebase-tools deploy --only firestore:rules --project hem-manager --non-interactive
npm run indexes:deploy   # = firebase deploy --only firestore:indexes --project hem-manager
```

Wait for the 7 composite indexes to reach **Enabled** in the Firebase console
(Firestore → Indexes) before step 2 — queries 404 until they build.

## 2. (No Cloud Functions step)

Migration Plan step 2 is replaced by:

- **Vercel env vars**: `CRON_SECRET`, `ENCRYPTION_KEY` (already set for the
  Content Performance Tracker), and the existing Firebase admin vars.
- **GitHub Actions cron** (`.github/workflows/scheduled-jobs.yml`) already
  carries the calendar jobs — they run automatically once this branch is on
  `main` (`schedule:` only fires from the default branch):
  - `members-reconcile` — nightly `31 2 * * *`
  - `calendar-reminders-send` — every `*/5 * * * *`
  - `calendar-reminders-expand` — every `2,17,32,47 * * * *`
  - `calendar-cleanup` — daily `17 3 * * *`

## 3. Backfill `members`

```bash
npm run backfill:members     # scripts/backfill-members.mjs — users/ → members/{uid}
```

Verify: `members` doc count == number of active `users`. Each new member also
gets a personal calendar (`ensurePersonalCalendar`).

## 4. Seed settings + shared calendars

```bash
npm run seed:calendar-settings   # config/calendarSettings (timezone, weekStartsOn:1, defaultView)
npm run seed:calendars           # 4 shared: default_goals (managerOnly) + campaigns/content/ads (everyone)
```

Both scripts are non-destructive (safe to re-run).

## 5. FCM — **skipped in v1** (answer #3)

Push is deferred. `fcmTokens` rules are already in place; no service worker or
permission flow ships now.

## 6. Merge + smoke test

```bash
git checkout main && git merge --no-ff feat/team-activity-calendar
git push origin main            # Vercel builds + deploys; cron schedules activate
```

Smoke test (Mục D task 13.3 acceptance): a manager signs in, opens
`/calendar`, sees **4 shared calendars + their personal calendar**, and can
create an item.

## Rollback

Remove the `Lịch đội` item from `src/components/common/AppSidebar.tsx` and
redeploy. Collections + rules stay (they don't touch the rest of the system).
