// Promotes an existing user to system_role: manager — the first-manager seed
// from docs/SPEC.md §6.9 step 1. Idempotent: only touches `system_role` (plus
// name/email if the users/ doc does not exist yet).
//
//   npm run seed:manager -- someone@example.com
//   SEED_MANAGER_EMAIL=someone@example.com npm run seed:manager
//
// The person must have signed in to the app at least once (Google login), so
// their Firebase Auth account exists.

import { initAdmin } from "./lib/admin.mjs"

const email = (process.argv[2] ?? process.env.SEED_MANAGER_EMAIL ?? "").trim()
if (!email) {
  console.error("Usage: npm run seed:manager -- <email>")
  process.exit(1)
}

const { auth, db } = initAdmin()

let user
try {
  user = await auth.getUserByEmail(email)
} catch {
  console.error(
    `No Firebase Auth account for ${email}. Ask them to sign in to the app ` +
      `once, then re-run.`
  )
  process.exit(1)
}

const ref = db.collection("users").doc(user.uid)
const before = await ref.get()

await ref.set(
  {
    system_role: "manager",
    ...(before.exists
      ? {}
      : { name: user.displayName || email.split("@")[0], email }),
  },
  { merge: true }
)

const after = (await ref.get()).data()
console.log(
  `✓ ${email} (uid ${user.uid}) → system_role: ${after.system_role}` +
    (before.exists && before.data().system_role === "manager"
      ? " (already a manager)"
      : "")
)
