import { FieldValue, type Firestore } from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  DEFAULT_SHARED_CALENDARS,
} from "@/lib/domain/calendar"

// Programmatic seed of the four default shared calendars (Mục D task 2.3).
// `scripts/seed-calendars.mjs` is the operator-facing copy of this — kept in
// sync. Non-destructive: a calendar that already exists is left untouched so a
// re-run never reverts a manager's rename / colour / writeScope change.
export async function seedDefaultSharedCalendars(
  db: Firestore
): Promise<{ created: number; existed: number }> {
  let created = 0
  let existed = 0

  for (const c of DEFAULT_SHARED_CALENDARS) {
    const ref = db.collection(CALENDAR_COLLECTIONS.calendars).doc(c.id)
    if ((await ref.get()).exists) {
      existed++
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
  }

  return { created, existed }
}
