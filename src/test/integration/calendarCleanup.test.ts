import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { runCalendarCleanup } from "@/lib/server/calendar/calendarCleanup"

// Mục D task 13.1 — the daily cleanup job against the emulator.

let db: Firestore
const NOW = Date.parse("2026-09-10T00:00:00.000Z")
const DAY = 86_400_000

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "cleanup-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "cleanup-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "cleanup-test")
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  for (const c of ["calendarItems", "dueReminders"]) {
    const snap = await db.collection(c).get()
    await Promise.all(
      snap.docs.map(async (d) => {
        const ex = await d.ref.collection("exceptions").get()
        await Promise.all(ex.docs.map((e) => e.ref.delete()))
        await d.ref.delete()
      })
    )
  }
})

const item = (id: string, deletedAtMs: number | null) =>
  db
    .collection("calendarItems")
    .doc(id)
    .set({
      title: id,
      calendarId: "c1",
      deletedAt: deletedAtMs == null ? null : Timestamp.fromMillis(deletedAtMs),
    })

describe("purge soft-deleted items", () => {
  it("removes items soft-deleted > 30 days ago and keeps the rest", async () => {
    await item("old", NOW - 40 * DAY)
    await item("recent", NOW - 10 * DAY)
    await item("live", null)
    await db
      .collection("calendarItems")
      .doc("old")
      .collection("exceptions")
      .doc("2026-08-01")
      .set({ action: "cancelled", overrides: {}, originalDateKey: "2026-08-01" })

    const res = await runCalendarCleanup(db, NOW)
    expect(res.purgedItems).toBe(1)
    expect(res.purgedExceptions).toBe(1)

    const ids = (await db.collection("calendarItems").get()).docs.map((d) => d.id)
    expect(ids.sort()).toEqual(["live", "recent"])
    const exc = await db
      .collection("calendarItems")
      .doc("old")
      .collection("exceptions")
      .get()
    expect(exc.empty).toBe(true)
  })

  it("is a no-op when nothing is stale", async () => {
    await item("live", null)
    await item("recent", NOW - 5 * DAY)
    const res = await runCalendarCleanup(db, NOW)
    expect(res.purgedItems).toBe(0)
  })
})

describe("purge spent reminders", () => {
  const reminder = (id: string, status: string, sendAtMs: number) =>
    db
      .collection("dueReminders")
      .doc(id)
      .set({
        itemId: "x",
        status,
        sendAt: Timestamp.fromMillis(sendAtMs),
        recipientUids: [],
      })

  it("drops old sent / cancelled rows, keeps pending and recent", async () => {
    await reminder("old-sent", "sent", NOW - 40 * DAY)
    await reminder("old-cancelled", "cancelled", NOW - 40 * DAY)
    await reminder("old-pending", "pending", NOW - 40 * DAY)
    await reminder("recent-sent", "sent", NOW - 2 * DAY)

    const res = await runCalendarCleanup(db, NOW)
    expect(res.purgedReminders).toBe(2)

    const ids = (await db.collection("dueReminders").get()).docs.map((d) => d.id)
    expect(ids.sort()).toEqual(["old-pending", "recent-sent"])
  })
})
