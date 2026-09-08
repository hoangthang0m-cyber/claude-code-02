import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { vnDayStartMs } from "@/lib/domain/calendar"
import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import {
  createItem,
  deleteItem,
  duplicateItem,
  restoreItem,
  updateItem,
} from "@/lib/server/calendar/calendarItemsService"

// The calendarItems orchestration service against the emulator
// (Mục D tasks 5.1–5.3): validation, the edit matrix, archived / managerOnly.

let db: Firestore
const MANAGER = { uid: "mgr", system_role: "manager" as const }
const STAFF = { uid: "an", system_role: "staff" as const }

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "itemsService-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "itemsService-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "itemsService-test")
  if (app) await deleteApp(app)
})

let everyoneCal: string
let managerCal: string

beforeEach(async () => {
  for (const c of ["calendars", "calendarItems", "members"]) {
    const snap = await db.collection(c).get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  }
  // the assignee directory (Mục B item-assignees — assignees must be members)
  await Promise.all(
    ["mgr", "an", "binh", "cuong"].map((uid) =>
      db.collection("members").doc(uid).set({
        uid,
        displayName: uid,
        photoURL: null,
        role: uid === "mgr" ? "manager" : "staff",
        active: true,
      })
    )
  )
  everyoneCal = (
    await createCalendar(db, {
      name: "Nội dung",
      color: "peacock",
      writeScope: "everyone",
      defaultReminders: [{ offsetMinutes: 15, channel: "inapp" }],
    })
  ).id
  managerCal = (
    await createCalendar(db, {
      name: "Mục tiêu phòng",
      color: "grape",
      writeScope: "managerOnly",
      defaultReminders: [],
    })
  ).id
})

const timed = (over = {}) => ({
  calendarId: everyoneCal,
  type: "activity",
  title: "Họp",
  startAt: "2026-09-10T02:00:00.000Z",
  endAt: "2026-09-10T03:30:00.000Z",
  ...over,
})

describe("createItem (task 5.2)", () => {
  it("creates a timed item with derived day fields", async () => {
    const { id } = await createItem(db, STAFF, timed())
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.startDay).toBe("2026-09-10")
    expect(d.createdBy).toBe("an")
    expect(d.spanDays).toBe(1)
  })

  it("creates an all-day, multi-day item", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({
        allDay: true,
        type: "goal",
        startAt: new Date(vnDayStartMs("2026-09-01")).toISOString(),
        endAt: new Date(vnDayStartMs("2026-10-01")).toISOString(),
      })
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.allDay).toBe(true)
    expect(d.startDay).toBe("2026-09-01")
    expect(d.endDay).toBe("2026-09-30")
    expect(d.spanDays).toBe(30)
  })

  it("inherits the calendar's defaultReminders when none are sent", async () => {
    const { id } = await createItem(db, STAFF, timed())
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.reminders).toEqual([{ offsetMinutes: 15, channel: "inapp" }])
  })

  it("keeps an explicit empty reminders list", async () => {
    const { id } = await createItem(db, STAFF, timed({ reminders: [] }))
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.reminders).toEqual([])
  })
})

describe("validation (task 5.3)", () => {
  it("rejects endAt <= startAt for a timed item", async () => {
    await expect(
      createItem(db, STAFF, timed({ endAt: "2026-09-10T02:00:00.000Z" }))
    ).rejects.toThrow(/sau giờ bắt đầu/)
  })

  it("allows a single-day all-day item (endDay == startDay)", async () => {
    const start = new Date(vnDayStartMs("2026-09-10")).toISOString()
    const { id } = await createItem(
      db,
      STAFF,
      timed({ allDay: true, startAt: start, endAt: start })
    )
    const d = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(d.spanDays).toBe(1)
  })
})

describe("calendar acceptability", () => {
  it("staff cannot create in a managerOnly calendar", async () => {
    await expect(
      createItem(db, STAFF, timed({ calendarId: managerCal }))
    ).rejects.toThrow()
  })

  it("manager can create in a managerOnly calendar", async () => {
    await expect(
      createItem(db, MANAGER, timed({ calendarId: managerCal }))
    ).resolves.toMatchObject({ id: expect.any(String) })
  })

  it("nobody can create in an archived calendar", async () => {
    await db.collection("calendars").doc(everyoneCal).update({ archived: true })
    await expect(createItem(db, MANAGER, timed())).rejects.toThrow(/lưu trữ/)
  })
})

describe("updateItem / deleteItem — the edit matrix (task 5.1)", () => {
  it("staff edits an item they created", async () => {
    const { id } = await createItem(db, STAFF, timed())
    await updateItem(db, STAFF, id, { title: "Đổi tên" })
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.title
    ).toBe("Đổi tên")
  })

  it("staff edits an item they are assigned to", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an"], primaryAssigneeId: "an" })
    )
    await expect(
      updateItem(db, STAFF, id, { location: "P.301" })
    ).resolves.toBeTruthy()
  })

  it("staff cannot edit an item they neither created nor are assigned to", async () => {
    const { id } = await createItem(db, MANAGER, timed())
    await expect(updateItem(db, STAFF, id, { title: "x" })).rejects.toThrow(
      /quyền/
    )
  })

  it("staff cannot move their item into a managerOnly calendar", async () => {
    const { id } = await createItem(db, STAFF, timed())
    await expect(
      updateItem(db, STAFF, id, { calendarId: managerCal })
    ).rejects.toThrow()
  })

  it("delete is a soft delete (deletedAt set); restore clears it", async () => {
    const { id } = await createItem(db, STAFF, timed())
    await deleteItem(db, STAFF, id)
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.deletedAt
    ).toBeInstanceOf(Timestamp)
    await restoreItem(db, STAFF, id)
    expect(
      (await db.collection("calendarItems").doc(id).get()).data()!.deletedAt
    ).toBeNull()
  })
})

describe("duplicateItem", () => {
  it("copies into the same calendar, drops recurrence, new creator", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ recurrence: "FREQ=WEEKLY", assigneeIds: ["an"] })
    )
    const { id: copyId } = await duplicateItem(db, STAFF, id)
    const d = (await db.collection("calendarItems").doc(copyId).get()).data()!
    expect(d.recurrence).toBeNull()
    expect(d.isRecurring).toBe(false)
    expect(d.assigneeIds).toEqual(["an"])
    expect(d.createdBy).toBe("an")
  })

  it("staff cannot duplicate an item that lives in a managerOnly calendar", async () => {
    const { id } = await createItem(db, MANAGER, timed({ calendarId: managerCal }))
    await expect(duplicateItem(db, STAFF, id)).rejects.toThrow()
  })
})

describe("assignees (tasks 9.1 / 9.2)", () => {
  const read = async (id: string) =>
    (await db.collection("calendarItems").doc(id).get()).data()!

  it("stores every assignee; the first added is primary by default", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an", "binh", "cuong"] })
    )
    const d = await read(id)
    expect(d.assigneeIds).toEqual(["an", "binh", "cuong"])
    expect(d.primaryAssigneeId).toBe("an")
  })

  it("an out-of-list primary request falls back to the first assignee", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an", "binh"], primaryAssigneeId: "khach" })
    )
    expect((await read(id)).primaryAssigneeId).toBe("an")
  })

  it("changing the primary keeps the others as assignees", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an", "binh", "cuong"] })
    )
    await updateItem(db, MANAGER, id, {
      assigneeIds: ["an", "binh", "cuong"],
      primaryAssigneeId: "binh",
    })
    const d = await read(id)
    expect(d.primaryAssigneeId).toBe("binh")
    expect(d.assigneeIds).toEqual(["an", "binh", "cuong"])
  })

  it("removing every assignee clears the primary", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an", "binh"], primaryAssigneeId: "binh" })
    )
    await updateItem(db, MANAGER, id, { assigneeIds: [], primaryAssigneeId: null })
    const d = await read(id)
    expect(d.assigneeIds).toEqual([])
    expect(d.primaryAssigneeId).toBeNull()
  })

  it("dropping the current primary from the list re-picks the first remaining", async () => {
    const { id } = await createItem(
      db,
      MANAGER,
      timed({ assigneeIds: ["an", "binh", "cuong"], primaryAssigneeId: "an" })
    )
    await updateItem(db, MANAGER, id, { assigneeIds: ["binh", "cuong"] })
    expect((await read(id)).primaryAssigneeId).toBe("binh")
  })

  it("rejects an assignee that is not in the directory (Scenario: ngoài danh bạ)", async () => {
    await expect(
      createItem(db, MANAGER, timed({ assigneeIds: ["an", "nguoi-la"] }))
    ).rejects.toThrow(/danh bạ/)
  })

  it("lets an existing off-directory assignee stay when editing other fields", async () => {
    // seed directly so the item already carries a since-departed assignee
    const { id } = await createItem(db, MANAGER, timed({ assigneeIds: ["an"] }))
    await db
      .collection("calendarItems")
      .doc(id)
      .update({ assigneeIds: ["an", "cuu-nhan-vien"], primaryAssigneeId: "an" })
    await expect(
      updateItem(db, MANAGER, id, { title: "Đổi tên, giữ người" })
    ).resolves.toBeTruthy()
    await expect(
      updateItem(db, MANAGER, id, {
        assigneeIds: ["an", "cuu-nhan-vien", "binh"],
      })
    ).resolves.toBeTruthy()
  })
})
