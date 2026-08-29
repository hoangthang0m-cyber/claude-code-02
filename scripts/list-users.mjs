// Lists Firebase Auth accounts and their users/ profile role.
// Helps the operator pick who to seed as the first manager (docs/SPEC.md §6.9).
//
//   npm run users:list

import { initAdmin } from "./lib/admin.mjs"

const { auth, db } = initAdmin()

const { users } = await auth.listUsers(100)
if (users.length === 0) {
  console.log("No Firebase Auth users yet — ask someone to sign in to the app once.")
  process.exit(0)
}

const profiles = await db.getAll(
  ...users.map((u) => db.collection("users").doc(u.uid))
)
const roleByUid = new Map(
  profiles.map((p) => [p.id, p.exists ? (p.data().system_role ?? "(none)") : "(no doc)"])
)

console.log("email".padEnd(36), "system_role".padEnd(12), "uid")
for (const u of users) {
  console.log(
    (u.email ?? "(no email)").padEnd(36),
    String(roleByUid.get(u.uid)).padEnd(12),
    u.uid
  )
}
