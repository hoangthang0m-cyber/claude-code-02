import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { vnDayStartMs } from "@/lib/domain/calendar"
import {
  createCalendarItem,
  duplicateCalendarItem,
  restoreCalendarItem,
  softDeleteCalendarItem,
  updateCalendarItem,
  type CalendarItemWriteInput,
} from "@/lib/server/calendar/calendarItemsRepo"

// calendarItemsRepo against the emulator (Mục D task 3.5): every write recomputes
// the day fields + updatedAt.

let db: Firestore

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "itemsRepo-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "itemsRepo-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "itemsRepo-test")
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  const snap = await db.collection("calendarItems").get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
})

const utc = (iso: string) => Date.parse(iso)

function input(over: Partial<CalendarItemWriteInput> = {}): CalendarItemWriteInput {
  return {
    calendarId: "calA",
    type: "activity",
    title: "  Họp team  ",
    description: null,
    location: null,
    allDay: false,
    startAtMs: utc("2026-09-10T02:00:00Z"), // 09:00 VN
    endAtMs: utc("2026-09-10T03:30:00Z"),
    colorOverride: null,
    assigneeIds: [],
    primaryAssigneeId: null,
    linkedProjectId: null,
    linkedContentItemId: null,
    reminders: [],
    recurrence: null,
    recurrenceId: null,
    ...over,
  }
}

describe("createCalendarItem", () => {
  it("stores trimmed title + derived day fields + audit fields", async () => {
    const { id } = await createCalendarItem(db, input(), "u1")
    const d = (await db.collection("calendarItems").doc(id).get()).data()!

    expect(d.title).toBe("Họp team")
    expect(d.startDay).toBe("2026-09-10")
    expect(d.endDay).toBe("2026-09-10")
    expect(d.spanDays).toBe(1)
    expect(d.dayKeys).toEqual(["2026-09-10"])
    expect(d.isLongSpan).toBe(false)
    expect(d.isRecurring).toBe(false)
    expect(d.createdBy).toBe("u1")
    expect(d.updatedBy).toBe("u1")
    expect(d.deletedAt).toBeNull()
    expect(d.createdAt).toBeInstanceOf(Timestamp)
  })

  it("multi-month span gets every day key; a 90-day one goes long-span", async () => {
    const cross = await createCalendarItem(
      db,
      input({
        allDay: true,
        startAtMs: vnDayStartMs("2026-08-25"),
        endAtMs: vnDayStartMs("2026-09-06"),
      }),
      "u1"
    )
    const d1 = (await db.collection("calendarItems").doc(cross.id).get()).data()!
    expect(d1.dayKeys).toContain("2026-08-31")
    expect(d1.dayKeys).toContain("2026-09-01")
    expect(d1.spanDays).toBe(12)

    const long = await createCalendarItem(
      db,
      input({
        allDay: true,
        startAtMs: vnDayStartMs("2026-06-01"),
        endAtMs: vnDayStartMs("2026-09-01"),
      }),
      "u1"
    )
    const d2 = (await db.collection("calendarItems").doc(long.id).get()).data()!
    expect(d2.isLongSpan).toBe(true)
    expect(d2.dayKeys).toBeNull()
  })

  it("recurrence != null → isRecurring true; picks primary assignee", async () => {
    const { id } = await createCalendarItem(
      db,
      input({
        recurrence: "FREQ=WEEKLY;BYDAY=MO",
        assigneeIds: ["a", "b"],
        primaryAssigneeId: null,
      }),
      "u1"
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.isRecurring).toBe(true)
    expect(d.primaryAssigneeId).toBe("a")
  })

  it("normalises all-day instants to VN midnight boundaries", async () => {
    // sloppy mid-day instants, both on 2026-09-10 → a clean 1-day all-day item
    const { id } = await createCalendarItem(
      db,
      input({
        allDay: true,
        startAtMs: utc("2026-09-10T05:00:00Z"), // 12:00 VN
        endAtMs: utc("2026-09-10T09:00:00Z"), // 16:00 VN
      }),
      "u1"
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect((d.startAt as Timestamp).toMillis()).toBe(vnDayStartMs("2026-09-10"))
    expect((d.endAt as Timestamp).toMillis()).toBe(vnDayStartMs("2026-09-11"))
    expect(d.startDay).toBe("2026-09-10")
    expect(d.endDay).toBe("2026-09-10")
    expect(d.spanDays).toBe(1)
  })

  it("all-day end instant during a later day extends to cover it", async () => {
    const { id } = await createCalendarItem(
      db,
      input({
        allDay: true,
        startAtMs: utc("2026-09-10T05:00:00Z"), // 12:00 VN on the 10th
        endAtMs: utc("2026-09-11T05:00:00Z"), // 12:00 VN on the 11th
      }),
      "u1"
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.startDay).toBe("2026-09-10")
    expect(d.endDay).toBe("2026-09-11")
    expect(d.spanDays).toBe(2)
    expect((d.endAt as Timestamp).toMillis()).toBe(vnDayStartMs("2026-09-12"))
  })
})

describe("updateCalendarItem", () => {
  it("recomputes day fields when the time changes", async () => {
    const { id } = await createCalendarItem(db, input(), "u1")
    await updateCalendarItem(
      db,
      id,
      { endAtMs: utc("2026-09-12T03:00:00Z") },
      "u2"
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.endDay).toBe("2026-09-12")
    expect(d.spanDays).toBe(3)
    expect(d.dayKeys).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"])
    expect(d.updatedBy).toBe("u2")
  })

  it("flips isRecurring when a rule is added / removed", async () => {
    const { id } = await createCalendarItem(db, input(), "u1")
    await updateCalendarItem(db, id, { recurrence: "FREQ=DAILY" }, "u1")
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.isRecurring
    ).toBe(true)
    await updateCalendarItem(db, id, { recurrence: null }, "u1")
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.isRecurring
    ).toBe(false)
  })

  it("can patch a nullable field to null and keeps others", async () => {
    const { id } = await createCalendarItem(
      db,
      input({ description: "cũ", location: "P.301" }),
      "u1"
    )
    await updateCalendarItem(db, id, { description: null }, "u1")
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.description).toBeNull()
    expect(d.location).toBe("P.301")
  })

  it("404 on a missing item", async () => {
    await expect(updateCalendarItem(db, "nope", { title: "x" }, "u1")).rejects.toThrow()
  })
})

describe("softDelete / restore", () => {
  it("sets then clears deletedAt", async () => {
    const { id } = await createCalendarItem(db, input(), "u1")
    await softDeleteCalendarItem(db, id, "u1")
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.deletedAt
    ).toBeInstanceOf(Timestamp)
    await restoreCalendarItem(db, id, "u1")
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.deletedAt
    ).toBeNull()
  })
})

describe("duplicateCalendarItem", () => {
  it("copies fields but drops the recurrence rule", async () => {
    const { id } = await createCalendarItem(
      db,
      input({
        title: "Chuỗi",
        recurrence: "FREQ=WEEKLY",
        recurrenceId: "orig",
        assigneeIds: ["a", "b"],
        primaryAssigneeId: "b",
        location: "Zoom",
      }),
      "u1"
    )
    const { id: copyId } = await duplicateCalendarItem(db, id, "u2")
    expect(copyId).not.toBe(id)

    const d = (await db.collection("calendarItems").doc(copyId).get()).data()!
    expect(d.title).toBe("Chuỗi")
    expect(d.location).toBe("Zoom")
    expect(d.assigneeIds).toEqual(["a", "b"])
    expect(d.primaryAssigneeId).toBe("b")
    expect(d.recurrence).toBeNull()
    expect(d.recurrenceId).toBeNull()
    expect(d.isRecurring).toBe(false)
    expect(d.createdBy).toBe("u2")
  })
})
