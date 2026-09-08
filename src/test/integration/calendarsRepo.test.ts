import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  assertCalendarAcceptsItems,
  createCalendar,
  deleteCalendar,
  updateCalendar,
} from "@/lib/server/calendar/calendarsRepo"

// Sub-calendar write layer against the emulator (Mục D group 4).

let db: Firestore

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "calendarsRepo-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "calendarsRepo-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "calendarsRepo-test")
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  for (const c of ["calendars", "calendarItems"]) {
    const snap = await db.collection(c).get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  }
})

const create = (over = {}) =>
  createCalendar(db, {
    name: "Chiến dịch",
    color: "tangerine",
    description: undefined,
    writeScope: "everyone",
    defaultReminders: [],
    ...over,
  })

async function seedItem(id: string, calendarId: string) {
  await db.collection("calendarItems").doc(id).set({
    calendarId,
    type: "task",
    title: id,
    deletedAt: null,
    startAt: Timestamp.now(),
    endAt: Timestamp.now(),
  })
}

describe("createCalendar", () => {
  it("creates a shared, non-archived calendar", async () => {
    const { id } = await create({ name: "  Nội dung  " })
    const d = (await db.collection("calendars").doc(id).get()).data()!
    expect(d).toMatchObject({
      name: "Nội dung",
      color: "tangerine",
      kind: "shared",
      ownerUid: null,
      writeScope: "everyone",
      archived: false,
    })
  })
})

describe("updateCalendar", () => {
  it("edits fields", async () => {
    const { id } = await create()
    await updateCalendar(db, id, { name: "Đổi tên", writeScope: "managerOnly" })
    const d = (await db.collection("calendars").doc(id).get()).data()!
    expect(d.name).toBe("Đổi tên")
    expect(d.writeScope).toBe("managerOnly")
  })

  it("toggles archived (task 4.5)", async () => {
    const { id } = await create()
    await updateCalendar(db, id, { archived: true })
    expect(
      (await db.collection("calendars").doc(id).get()).data()!.archived
    ).toBe(true)
  })

  it("rejects an empty patch and a missing calendar", async () => {
    const { id } = await create()
    await expect(updateCalendar(db, id, {})).rejects.toThrow()
    await expect(updateCalendar(db, "nope", { name: "x" })).rejects.toThrow()
  })
})

describe("deleteCalendar (task 4.4)", () => {
  it("reassign moves every item then removes the calendar", async () => {
    const a = await create({ name: "A" })
    const b = await create({ name: "B" })
    await seedItem("i1", a.id)
    await seedItem("i2", a.id)

    const res = await deleteCalendar(db, a.id, "reassign", b.id)
    expect(res).toEqual({ mode: "reassign", affectedItems: 2 })
    expect((await db.collection("calendars").doc(a.id).get()).exists).toBe(false)
    expect(
      (await db.collection("calendarItems").doc("i1").get()).data()!.calendarId
    ).toBe(b.id)
  })

  it("deleteItems hard-deletes the items then the calendar", async () => {
    const a = await create({ name: "A" })
    await seedItem("i1", a.id)
    await seedItem("i2", a.id)

    const res = await deleteCalendar(db, a.id, "deleteItems", null)
    expect(res).toEqual({ mode: "deleteItems", affectedItems: 2 })
    expect((await db.collection("calendarItems").doc("i1").get()).exists).toBe(
      false
    )
  })

  it("reassign validates the target", async () => {
    const a = await create({ name: "A" })
    await expect(deleteCalendar(db, a.id, "reassign", null)).rejects.toThrow()
    await expect(deleteCalendar(db, a.id, "reassign", a.id)).rejects.toThrow()
    await expect(
      deleteCalendar(db, a.id, "reassign", "ghost")
    ).rejects.toThrow()
  })

  it("refuses to delete a personal calendar", async () => {
    await db.collection("calendars").doc("p1").set({
      name: "An",
      kind: "personal",
      ownerUid: "u1",
      writeScope: "everyone",
      archived: false,
    })
    await expect(
      deleteCalendar(db, "p1", "deleteItems", null)
    ).rejects.toThrow()
  })
})

describe("assertCalendarAcceptsItems", () => {
  it("blocks an archived calendar for everyone", async () => {
    const { id } = await create()
    await updateCalendar(db, id, { archived: true })
    await expect(
      assertCalendarAcceptsItems(db, id, { system_role: "manager" })
    ).rejects.toThrow(/lưu trữ/)
  })

  it("blocks a managerOnly calendar for staff, allows manager", async () => {
    const { id } = await create({ writeScope: "managerOnly" })
    await expect(
      assertCalendarAcceptsItems(db, id, { system_role: "staff" })
    ).rejects.toThrow()
    await expect(
      assertCalendarAcceptsItems(db, id, { system_role: "manager" })
    ).resolves.toBeUndefined()
  })

  it("allows an everyone calendar for staff", async () => {
    const { id } = await create()
    await expect(
      assertCalendarAcceptsItems(db, id, { system_role: "staff" })
    ).resolves.toBeUndefined()
  })
})
