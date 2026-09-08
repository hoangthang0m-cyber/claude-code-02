// Seeds the four default shared calendars for the Team Activity Calendar
// (docs/team-activity-calendar-spec.md — Mục B `team-calendar`; Mục D task 2.3).
//
//   npm run seed:calendars
//
// Non-destructive: fixed doc ids, creates a calendar only if it is absent, so a
// re-run never reverts a rename / colour / writeScope a manager changed later.
// Keep in sync with DEFAULT_SHARED_CALENDARS in
// src/lib/domain/calendar/calendar.ts.

import { FieldValue } from "firebase-admin/firestore"

import { initAdmin } from "./lib/admin.mjs"

const DEFAULT_SHARED_CALENDARS = [
  {
    id: "default_goals",
    name: "Mục tiêu phòng",
    color: "grape",
    writeScope: "managerOnly",
    defaultReminders: [{ offsetMinutes: 1440, channel: "inapp" }],
  },
  {
    id: "default_campaigns",
    name: "Chiến dịch",
    color: "tangerine",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 30, channel: "inapp" }],
  },
  {
    id: "default_content",
    name: "Nội dung",
    color: "peacock",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 10, channel: "inapp" }],
  },
  {
    id: "default_ads",
    name: "Ads",
    color: "basil",
    writeScope: "everyone",
    defaultReminders: [{ offsetMinutes: 10, channel: "inapp" }],
  },
]

const { db } = initAdmin()

let created = 0
for (const c of DEFAULT_SHARED_CALENDARS) {
  const ref = db.collection("calendars").doc(c.id)
  const before = await ref.get()
  if (before.exists) {
    console.log(`• calendars/${c.id} — "${before.data().name}" already exists`)
    continue
  }
  const now = FieldValue.serverTimestamp()
  await ref.set({
    name: c.name,
    color: c.color,
    description: null,
    kind: "shared",
    ownerUid: null,
    writeScope: c.writeScope,
    defaultReminders: c.defaultReminders,
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  created++
  console.log(`✓ calendars/${c.id} — ${c.name} (${c.writeScope})`)
}

console.log(`\nDone — ${created} created, ${DEFAULT_SHARED_CALENDARS.length - created} already present.`)
process.exit(0)
