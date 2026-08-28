# First-run setup

Implements `docs/SPEC.md` §6.9. A new system with no data to migrate.

## 0. Prerequisites

- `.env.local` filled in — see `docs/ENV.md`. `FIREBASE_ADMIN_*` is required for
  every `/api/*` route and for the scripts below.

### Deploy the Firestore security rules

`firestore.rules` (and `storage.rules`) live in the repo but must be pushed to
the `hem-manager` Firebase project whenever they change. `firebase.json` /
`.firebaserc` are configured; you do NOT need `firebase-tools` installed locally
(the script uses `npx`).

**Option A — service account (no browser login):**

```
# bash / git-bash
GOOGLE_APPLICATION_CREDENTIALS="C:/Users/Admin/Downloads/hem-manager-firebase-adminsdk-fbsvc-ed828e5d35.json" npm run rules:deploy
```

```
# PowerShell
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Admin\Downloads\hem-manager-firebase-adminsdk-fbsvc-ed828e5d35.json"
npm run rules:deploy
```

The `firebase-adminsdk-fbsvc@hem-manager` service account already has the
`Firebase Rules Admin` permission. Move the key file somewhere permanent (e.g.
`C:\keys\`) and point the env var there for repeat use — keep it out of the repo.

**Option B — interactive login:**

```
npx --yes firebase-tools login
npm run rules:deploy
```

**Option C — Firebase console (no CLI):**

Firebase console → **Firestore Database** → **Rules** tab → paste the full
contents of `firestore.rules` → **Publish**. Repeat for **Storage** → **Rules**
with `storage.rules`.

**Verify:** the console Rules tab shows the new `isProjectMember` function and
the `match /projects/{projectId}` block with `allow read: if isProjectMember(...)`.

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
