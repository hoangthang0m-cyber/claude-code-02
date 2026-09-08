import {
  Timestamp,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from "firebase-admin/firestore"

import { CALENDAR_COLLECTIONS } from "@/lib/domain/calendar"

// Mục D task 13.1 — the daily housekeeping job (Mục C Migration Plan step 2
// "scheduled hằng ngày (dọn xoá mềm)"). No Cloud Functions in this repo
// (spec doc answer #2), so it runs from `/api/jobs/calendar-cleanup` on the
// GitHub Actions cron. No `dayCounts` upkeep — the Year view queries
// `startDay`/`endDay` directly (answer #5).

const ITEMS = CALENDAR_COLLECTIONS.calendarItems
const EXC = CALENDAR_COLLECTIONS.exceptions
const DUE = CALENDAR_COLLECTIONS.dueReminders

const DAY_MS = 86_400_000
export const SOFT_DELETE_TTL_MS = 30 * DAY_MS
// keep a spent reminder around a while for debugging, then drop it
const DUE_REMINDER_TTL_MS = 30 * DAY_MS

async function commitInChunks(
  db: Firestore,
  docs: QueryDocumentSnapshot[],
  apply: (batch: WriteBatch, doc: QueryDocumentSnapshot) => void
): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    for (const doc of docs.slice(i, i + 400)) apply(batch, doc)
    await batch.commit()
  }
}

// Hard-delete calendar items whose `deletedAt` is older than 30 days, together
// with their `exceptions` subcollection. A Firestore range filter never matches
// `deletedAt == null`, so this only ever sees soft-deleted rows.
export async function purgeSoftDeletedItems(
  db: Firestore,
  nowMs: number = Date.now()
): Promise<{ purgedItems: number; purgedExceptions: number }> {
  const cutoff = Timestamp.fromMillis(nowMs - SOFT_DELETE_TTL_MS)
  const stale = await db.collection(ITEMS).where("deletedAt", "<", cutoff).get()

  let purgedExceptions = 0
  for (const d of stale.docs) {
    const exc = await d.ref.collection(EXC).get()
    purgedExceptions += exc.size
    await commitInChunks(db, exc.docs, (batch, e) => batch.delete(e.ref))
  }
  await commitInChunks(db, stale.docs, (batch, d) => batch.delete(d.ref))

  return { purgedItems: stale.size, purgedExceptions }
}

// Drop `sent` / `cancelled` reminder-queue rows once they are well past — the
// queue would otherwise grow without bound. `pending` rows are never touched.
export async function purgeSpentReminders(
  db: Firestore,
  nowMs: number = Date.now()
): Promise<{ purgedReminders: number }> {
  const cutoff = Timestamp.fromMillis(nowMs - DUE_REMINDER_TTL_MS)
  const old = await db.collection(DUE).where("sendAt", "<", cutoff).get()
  const spent = old.docs.filter((d) => d.data().status !== "pending")
  await commitInChunks(db, spent, (batch, d) => batch.delete(d.ref))
  return { purgedReminders: spent.length }
}

export async function runCalendarCleanup(
  db: Firestore,
  nowMs: number = Date.now()
): Promise<{
  purgedItems: number
  purgedExceptions: number
  purgedReminders: number
}> {
  const items = await purgeSoftDeletedItems(db, nowMs)
  const reminders = await purgeSpentReminders(db, nowMs)
  return { ...items, ...reminders }
}
