// Seeds config/calendarSettings for the Team Activity Calendar
// (docs/team-activity-calendar-spec.md — Mục C §1; Mục D task 1.4). Idempotent:
// re-running only refreshes the three fields.
//
//   npm run seed:calendar-settings
//
// Against the emulator instead of the live project:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:calendar-settings

import { initAdmin } from "./lib/admin.mjs"

const SETTINGS = {
  timezone: "Asia/Ho_Chi_Minh",
  weekStartsOn: 1, // thứ Hai (ISO-8601)
  defaultView: "week",
}

const { db } = initAdmin()
const ref = db.doc("config/calendarSettings")
const before = await ref.get()

await ref.set(SETTINGS, { merge: true })

const after = (await ref.get()).data()
console.log(
  `✓ config/calendarSettings ${before.exists ? "updated" : "created"}:`,
  after
)
