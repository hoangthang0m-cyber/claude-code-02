# First-run setup

Implements `docs/SPEC.md` §6.9. A new system with no data to migrate.

## 0. Prerequisites

- `.env.local` filled in — see `docs/ENV.md`. `FIREBASE_ADMIN_*` is required for
  every `/api/*` route and for the scripts below.

## 1. Seed the first manager (§6.9 step 1)

The person signs in to the app once (Google login) so their Firebase Auth
account and `users/` doc exist, then:

```
npm run users:list                       # see who has signed in
npm run seed:manager -- someone@email.com # set system_role: manager
```

Idempotent — safe to re-run. Only `system_role` is changed. SPEC allows several
managers; run it once per manager.

## 2. Manager creates projects and adds members (§6.9 step 2)

_Built in checklist group 7.2._

## 3. Per running project: attach the Google Sheet + column mapping (§6.9 step 3)

_Built in checklist group 7.6._

## 4. Connect the Meta Ad Account, bind content items (§6.9 step 4)

_Built in checklist group 7.5._

## 5. Turn on background sync (§6.9 step 5)

_Built in groups 7.5 / 7.6._

## Rollback

Turn off sync at the project level; the Sheet stays the working source
(§6.9).
