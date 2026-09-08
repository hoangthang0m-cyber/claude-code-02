// First-run backfill of `members/{uid}` from the existing `users` directory for
// the Team Activity Calendar (docs/team-activity-calendar-spec.md — Mục D
// task 2.2). Also creates each member's personal calendar (task 2.4).
//
//   npm run backfill:members
//
// Idempotent — this is exactly what POST /api/jobs/members-reconcile does on its
// nightly run; running it once by hand at first launch just seeds everyone
// before anyone has logged in. Keep the projection in sync with
// src/lib/server/calendar/membersSync.ts (resolveMemberFields).

import { FieldValue } from "firebase-admin/firestore"

import { initAdmin } from "./lib/admin.mjs"

const { db } = initAdmin()

function resolveMemberFields(u) {
  const name = String(u?.name ?? "").trim()
  const email = String(u?.email ?? "")
  const systemRole = String(u?.system_role ?? "staff")
  return {
    displayName: name || email.split("@")[0] || "Thành viên",
    photoURL: u?.avatar || null,
    role: systemRole === "manager" ? "manager" : "staff",
    active: true,
  }
}

async function ensurePersonalCalendar(uid, displayName) {
  const existing = await db
    .collection("calendars")
    .where("kind", "==", "personal")
    .where("ownerUid", "==", uid)
    .limit(1)
    .get()
  if (!existing.empty) return false
  const now = FieldValue.serverTimestamp()
  await db.collection("calendars").add({
    name: displayName,
    color: "peacock",
    description: null,
    kind: "personal",
    ownerUid: uid,
    writeScope: "everyone",
    defaultReminders: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  return true
}

const usersSnap = await db.collection("users").get()
let membersWritten = 0
let calendarsCreated = 0

for (const userDoc of usersSnap.docs) {
  const fields = resolveMemberFields(userDoc.data())
  await db
    .collection("members")
    .doc(userDoc.id)
    .set({ uid: userDoc.id, ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  membersWritten++
  if (await ensurePersonalCalendar(userDoc.id, fields.displayName)) calendarsCreated++
  console.log(`✓ members/${userDoc.id} — ${fields.displayName} (${fields.role})`)
}

const membersCount = (await db.collection("members").where("active", "==", true).get()).size
console.log(
  `\nDone — ${membersWritten} members written, ${calendarsCreated} personal calendars created.`
)
console.log(`Active members now: ${membersCount} (should equal the active user count).`)
process.exit(0)
