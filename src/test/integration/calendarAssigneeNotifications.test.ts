import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import {
  createItem,
  duplicateItem,
  updateItem,
} from "@/lib/server/calendar/calendarItemsService"
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/server/calendar/calendarNotifications"

// Mục B `item-assignees` — "Thông báo khi được giao hoặc gỡ khỏi mục", against
// the emulator (the send job's reminder rows are covered in calendarReminders).

let db: Firestore
const MGR = { uid: "mgr", system_role: "manager" as const }
const AN = { uid: "an", system_role: "staff" as const }

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "assignee-notif-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "assignee-notif-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "assignee-notif-test")
  if (app) await deleteApp(app)
})

let cal: string

beforeEach(async () => {
  for (const c of ["calendars", "calendarItems", "members", "calendarNotifications", "dueReminders"]) {
    const snap = await db.collection(c).get()
    await Promise.all(
      snap.docs.map(async (d) => {
        const items = await d.ref.collection("items").get()
        await Promise.all(items.docs.map((x) => x.ref.delete()))
        await d.ref.delete()
      })
    )
  }
  await Promise.all(
    ["mgr", "an", "binh"].map((uid) =>
      db
        .collection("members")
        .doc(uid)
        .set({ uid, displayName: uid, photoURL: null, role: "staff", active: true })
    )
  )
  cal = (
    await createCalendar(db, {
      name: "Nội dung",
      color: "peacock",
      writeScope: "everyone",
      defaultReminders: [],
    })
  ).id
})

const feed = (uid: string) =>
  db.collection("calendarNotifications").doc(uid).collection("items")

const timed = (over: Record<string, unknown> = {}) => ({
  calendarId: cal,
  type: "activity",
  title: "Họp tuần",
  startAt: "2026-09-10T09:00:00.000Z",
  endAt: "2026-09-10T10:00:00.000Z",
  ...over,
})

describe("được giao / bị gỡ", () => {
  it("adding a member on create notifies them (Scenario: Được giao một mục)", async () => {
    await createItem(db, MGR, timed({ assigneeIds: ["an"] }))
    const rows = await feed("an").get()
    expect(rows.size).toBe(1)
    expect(rows.docs[0].data().kind).toBe("assigned")
    expect(rows.docs[0].data().message).toBe("Bạn được giao: Họp tuần")
  })

  it("removing a member notifies them (Scenario: Bị gỡ khỏi mục)", async () => {
    const { id } = await createItem(db, MGR, timed({ assigneeIds: ["an", "binh"] }))
    await updateItem(db, MGR, id, { assigneeIds: ["binh"] })
    const rows = (await feed("an").get()).docs.map((d) => d.data())
    expect(rows.map((r) => r.kind).sort()).toEqual(["assigned", "unassigned"])
    expect(rows.find((r) => r.kind === "unassigned")!.message).toBe(
      "Bạn không còn đảm nhận: Họp tuần"
    )
  })

  it("adding yourself does not notify you (Scenario: Tự nhận không tạo thông báo thừa)", async () => {
    const { id } = await createItem(db, AN, timed())
    await updateItem(db, AN, id, { assigneeIds: ["an"] })
    expect((await feed("an").get()).size).toBe(0)
  })

  it("the actor is never notified even when adding others", async () => {
    await createItem(db, MGR, timed({ assigneeIds: ["an", "binh"] }))
    expect((await feed("mgr").get()).size).toBe(0)
    expect((await feed("an").get()).size).toBe(1)
    expect((await feed("binh").get()).size).toBe(1)
  })

  it("duplicating an item notifies the copied-over assignees", async () => {
    const { id } = await createItem(db, MGR, timed({ assigneeIds: ["an"] }))
    // clear the create-time notification so we only see the duplicate's
    await markAllNotificationsRead(db, "an")
    await duplicateItem(db, MGR, id)
    const unread = (await feed("an").get()).docs.filter(
      (d) => d.data().readAt == null
    )
    expect(unread).toHaveLength(1)
    expect(unread[0].data().kind).toBe("assigned")
  })
})

describe("mark read", () => {
  it("marks one, then all", async () => {
    const { id } = await createItem(db, MGR, timed({ assigneeIds: ["an"] }))
    await updateItem(db, MGR, id, { assigneeIds: ["an", "binh"], title: "Đổi" })
    const rows = await feed("an").get()
    expect(rows.size).toBeGreaterThanOrEqual(1)

    const first = await markNotificationRead(db, "an", rows.docs[0].id)
    expect(first.readAt).toBeGreaterThan(0)
    // idempotent — a second mark is a no-op that still returns a read time
    const again = await markNotificationRead(db, "an", rows.docs[0].id)
    expect(again.readAt).toBeGreaterThan(0)

    const { marked } = await markAllNotificationsRead(db, "an")
    expect(marked).toBeGreaterThanOrEqual(0)
    const after = await feed("an").where("readAt", "==", null).get()
    expect(after.size).toBe(0)
  })
})
