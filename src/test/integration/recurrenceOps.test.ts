import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { expandRecurrence, vnDayStartMs } from "@/lib/domain/calendar"
import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import { createItem, updateItem } from "@/lib/server/calendar/calendarItemsService"
import { deleteSeries, editSeries } from "@/lib/server/calendar/recurrenceOps"

// Scope-aware series edit / delete against the emulator (Mục D tasks
// 8.3 / 8.4 / 8.5 / 8.6).

let db: Firestore
const MGR = { uid: "mgr", system_role: "manager" as const }

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "recurrenceOps-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "recurrenceOps-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "recurrenceOps-test")
  if (app) await deleteApp(app)
})

let calId: string
beforeEach(async () => {
  for (const c of ["calendars", "calendarItems"]) {
    const snap = await db.collection(c).get()
    await Promise.all(
      snap.docs.map(async (d) => {
        const ex = await d.ref.collection("exceptions").get()
        await Promise.all(ex.docs.map((e) => e.ref.delete()))
        await d.ref.delete()
      })
    )
  }
  calId = (
    await createCalendar(db, {
      name: "Chuỗi",
      color: "peacock",
      writeScope: "everyone",
      defaultReminders: [],
    })
  ).id
})

async function seedDailyMaster(startDay = "2026-09-07") {
  return createItem(db, MGR, {
    calendarId: calId,
    type: "activity",
    title: "Chuỗi ngày",
    startAt: new Date(vnDayStartMs(startDay) + 9 * 3_600_000).toISOString(),
    endAt: new Date(vnDayStartMs(startDay) + 10 * 3_600_000).toISOString(),
    recurrence: "FREQ=DAILY",
  })
}

async function master(id: string) {
  return (await db.collection("calendarItems").doc(id).get()).data()!
}
async function exceptions(id: string) {
  const s = await db.collection("calendarItems").doc(id).collection("exceptions").get()
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
}

describe("convert single ↔ recurring (task 8.3)", () => {
  it("adding a rule keeps the first occurrence at the old time", async () => {
    const { id } = await createItem(db, MGR, {
      calendarId: calId,
      type: "task",
      title: "Đơn",
      startAt: new Date(vnDayStartMs("2026-09-07") + 8 * 3_600_000).toISOString(),
      endAt: new Date(vnDayStartMs("2026-09-07") + 9 * 3_600_000).toISOString(),
    })
    await updateItem(db, MGR, id, { recurrence: "FREQ=WEEKLY;BYDAY=MO" })
    const m = await master(id)
    expect(m.isRecurring).toBe(true)
    expect((m.startAt as Timestamp).toMillis()).toBe(
      vnDayStartMs("2026-09-07") + 8 * 3_600_000
    )
  })
})

describe("editSeries — 'this' (task 8.4)", () => {
  it("writes a 'modified' exception, other occurrences untouched", async () => {
    const { id } = await seedDailyMaster()
    await editSeries(db, MGR, id, "2026-09-09", "this", {
      title: "Dời",
      startAtMs: vnDayStartMs("2026-09-09") + 15 * 3_600_000,
      endAtMs: vnDayStartMs("2026-09-09") + 16 * 3_600_000,
    })
    const ex = await exceptions(id)
    expect(ex).toHaveLength(1)
    expect(ex[0]).toMatchObject({ id: "2026-09-09", action: "modified" })

    const m = await master(id)
    const occ = expandRecurrence(
      { id, ...m } as never,
      ex as never,
      "2026-09-07",
      "2026-09-10"
    )
    const nine = occ.find((o) => o.occurrence?.occurrenceKey === "2026-09-09")
    expect(nine?.title).toBe("Dời")
    expect(
      occ.find((o) => o.occurrence?.occurrenceKey === "2026-09-08")?.title
    ).toBe("Chuỗi ngày")
  })
})

describe("editSeries — 'all' + exception preservation (task 8.6)", () => {
  it("editing the whole series does not overwrite a 'this' exception by default", async () => {
    const { id } = await seedDailyMaster()
    await editSeries(db, MGR, id, "2026-09-09", "this", {
      startAtMs: vnDayStartMs("2026-09-09") + 16 * 3_600_000,
      endAtMs: vnDayStartMs("2026-09-09") + 17 * 3_600_000,
    })
    await editSeries(db, MGR, id, "2026-09-08", "all", {
      startAtMs: vnDayStartMs("2026-09-07") + 8 * 3_600_000,
      endAtMs: vnDayStartMs("2026-09-07") + 9 * 3_600_000,
    })
    expect(await exceptions(id)).toHaveLength(1) // kept

    await editSeries(
      db,
      MGR,
      id,
      "2026-09-08",
      "all",
      { title: "Đổi tên toàn chuỗi" },
      true // overwrite
    )
    expect(await exceptions(id)).toHaveLength(0) // cleared
  })
})

describe("editSeries — 'thisAndFollowing' (task 8.4)", () => {
  it("caps the master's rule and creates a new master from the split point", async () => {
    const { id } = await seedDailyMaster("2026-09-07")
    const { id: newId } = await editSeries(
      db,
      MGR,
      id,
      "2026-09-10",
      "thisAndFollowing",
      { location: "P.500" }
    )
    expect(newId).not.toBe(id)

    const oldM = await master(id)
    expect(oldM.recurrence).toContain("UNTIL=20260909")

    const newM = await master(newId)
    expect(newM.location).toBe("P.500")
    expect(newM.recurrenceId).toBe(id)
    expect(newM.recurrence).not.toContain("UNTIL")
    expect((newM.startAt as Timestamp).toMillis()).toBe(
      vnDayStartMs("2026-09-10") + 9 * 3_600_000
    )
  })
})

describe("deleteSeries (task 8.5)", () => {
  it("'this' → a cancelled exception", async () => {
    const { id } = await seedDailyMaster()
    await deleteSeries(db, MGR, id, "2026-09-09", "this")
    const ex = await exceptions(id)
    expect(ex[0]).toMatchObject({ id: "2026-09-09", action: "cancelled" })

    const occ = expandRecurrence(
      { id, ...(await master(id)) } as never,
      ex as never,
      "2026-09-07",
      "2026-09-11"
    )
    expect(occ.map((o) => o.occurrence?.occurrenceKey)).not.toContain(
      "2026-09-09"
    )
    expect(occ.map((o) => o.occurrence?.occurrenceKey)).toContain("2026-09-10")
  })

  it("'thisAndFollowing' caps the rule; deleting from the start soft-deletes the master", async () => {
    const { id } = await seedDailyMaster("2026-09-07")
    await deleteSeries(db, MGR, id, "2026-09-10", "thisAndFollowing")
    expect((await master(id)).recurrence).toContain("UNTIL=20260909")

    const { id: id2 } = await seedDailyMaster("2026-10-01")
    await deleteSeries(db, MGR, id2, "2026-10-01", "thisAndFollowing")
    expect((await master(id2)).deletedAt).toBeInstanceOf(Timestamp)
  })
})
