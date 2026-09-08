import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { dueReminderId, SINGLE_OCCURRENCE_KEY } from "@/lib/domain/calendar"
import { createCalendar } from "@/lib/server/calendar/calendarsRepo"
import {
  createItem,
  deleteItem,
  updateItem,
} from "@/lib/server/calendar/calendarItemsService"
import {
  expandRecurringReminders,
  recomputeItemReminders,
  sendDueReminders,
  snoozeReminder,
} from "@/lib/server/calendar/calendarReminders"

// Mục D group 10 — the `dueReminders` queue + the send job, against the emulator.

let db: Firestore
const MGR = { uid: "mgr", system_role: "manager" as const }

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "reminders-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "reminders-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "reminders-test")
  if (app) await deleteApp(app)
})

let cal: string

beforeEach(async () => {
  for (const c of [
    "calendars",
    "calendarItems",
    "dueReminders",
    "members",
    "calendarNotifications",
  ]) {
    const snap = await db.collection(c).get()
    await Promise.all(
      snap.docs.map(async (d) => {
        for (const sub of ["exceptions", "items"]) {
          const s = await d.ref.collection(sub).get()
          await Promise.all(s.docs.map((x) => x.ref.delete()))
        }
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
      defaultReminders: [{ offsetMinutes: 30, channel: "inapp" }],
    })
  ).id
})

const at = (iso: string) => new Date(iso).toISOString()
const timed = (over: Record<string, unknown> = {}) => ({
  calendarId: cal,
  type: "activity",
  title: "Họp",
  startAt: at("2026-09-10T09:00:00.000Z"),
  endAt: at("2026-09-10T10:00:00.000Z"),
  ...over,
})

const dueFor = async (itemId: string) =>
  (await db.collection("dueReminders").where("itemId", "==", itemId).get()).docs.map(
    (d) => ({ id: d.id, ...d.data() })
  )

describe("task 10.3 — non-recurring recompute on write", () => {
  const NOW = Date.parse("2026-09-10T00:00:00.000Z") // well before the item

  it("queues one row per reminder offset with sendAt = start - offset", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, NOW)
    const rows = await dueFor(id)
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, unknown>
    expect(r.id).toBe(dueReminderId(id, SINGLE_OCCURRENCE_KEY, 10))
    expect((r.sendAt as Timestamp).toMillis()).toBe(
      Date.parse("2026-09-10T08:50:00.000Z")
    )
    expect(r.status).toBe("pending")
  })

  it("recipients = assignees ∪ creator (Scenario: Nhắc tới người đảm nhận)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({
        assigneeIds: ["an", "binh"],
        reminders: [{ offsetMinutes: 10, channel: "inapp" }],
      })
    )
    await recomputeItemReminders(db, id, NOW)
    const r = (await dueFor(id))[0] as Record<string, unknown>
    expect((r.recipientUids as string[]).sort()).toEqual(["an", "binh", "mgr"])
  })

  it("no assignees → only the creator (Scenario: Mục không người đảm nhận)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, NOW)
    const r = (await dueFor(id))[0] as Record<string, unknown>
    expect(r.recipientUids).toEqual(["mgr"])
  })

  it("moving the item moves the sendAt (Scenario: Dời mục làm dời nhắc)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, NOW)
    await updateItem(db, MGR, id, {
      startAt: at("2026-09-10T11:00:00.000Z"),
      endAt: at("2026-09-10T12:00:00.000Z"),
    })
    await recomputeItemReminders(db, id, NOW)
    const rows = await dueFor(id)
    expect(rows).toHaveLength(1)
    expect(((rows[0] as Record<string, unknown>).sendAt as Timestamp).toMillis()).toBe(
      Date.parse("2026-09-10T10:50:00.000Z")
    )
  })

  it("a sendAt already in the past is not queued (không gửi nhắc trễ)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    // "now" is 5 minutes before start → the 10-minutes-before mark is already past
    await recomputeItemReminders(db, id, Date.parse("2026-09-10T08:55:00.000Z"))
    expect(await dueFor(id)).toHaveLength(0)
  })

  it("clearing every reminder removes the pending rows (Scenario: Xoá hết mốc nhắc)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, NOW)
    await updateItem(db, MGR, id, { reminders: [] })
    expect(await dueFor(id)).toHaveLength(0)
  })

  it("soft-deleting the item cancels its pending reminders", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, NOW)
    await deleteItem(db, MGR, id)
    const rows = await dueFor(id)
    expect(rows.every((r) => (r as Record<string, unknown>).status === "cancelled")).toBe(
      true
    )
  })
})

describe("task 10.4 — recurring expansion is idempotent", () => {
  const NOW = Date.parse("2026-09-10T00:00:00.000Z")

  async function seedRecurring() {
    return createItem(
      db,
      MGR,
      timed({
        recurrence: "FREQ=DAILY",
        reminders: [{ offsetMinutes: 15, channel: "inapp" }],
      })
    )
  }

  it("queues occurrences in the next 36h, keyed by occurrence", async () => {
    const { id } = await seedRecurring()
    const res = await expandRecurringReminders(db, NOW)
    expect(res.upserted).toBeGreaterThan(0)
    const rows = await dueFor(id)
    // 2026-09-10 and 2026-09-11 fall inside [NOW, NOW+36h]
    expect(rows.length).toBe(2)
    for (const r of rows) {
      expect((r as Record<string, unknown>).id).toMatch(
        new RegExp(`^${id}_2026-09-\\d\\d_15$`)
      )
    }
  })

  it("a second run in the same window creates no duplicates", async () => {
    const { id } = await seedRecurring()
    await expandRecurringReminders(db, NOW)
    const first = (await dueFor(id)).map((r) => (r as Record<string, unknown>).id).sort()
    await expandRecurringReminders(db, NOW)
    const second = (await dueFor(id)).map((r) => (r as Record<string, unknown>).id).sort()
    expect(second).toEqual(first)
  })
})

describe("task 10.5 — the send job", () => {
  it("writes an in-app bell row per recipient and marks the queue row sent", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({
        assigneeIds: ["an", "binh"],
        reminders: [{ offsetMinutes: 10, channel: "inapp" }],
      })
    )
    await recomputeItemReminders(db, id, Date.parse("2026-09-10T00:00:00.000Z"))
    // send job runs after the mark
    const res = await sendDueReminders(db, Date.parse("2026-09-10T08:55:00.000Z"))
    expect(res.sent).toBe(1)
    expect(res.notifications).toBe(3) // an, binh, mgr

    for (const uid of ["an", "binh", "mgr"]) {
      const reminders = (
        await db
          .collection("calendarNotifications")
          .doc(uid)
          .collection("items")
          .where("kind", "==", "reminder")
          .get()
      ).docs
      expect(reminders).toHaveLength(1)
      expect(reminders[0].data().readAt).toBeNull()
    }
    const row = (await dueFor(id))[0] as Record<string, unknown>
    expect(row.status).toBe("sent")
  })

  it("a push-channel reminder still writes the in-app row and does not throw", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "push" }] })
    )
    await recomputeItemReminders(db, id, Date.parse("2026-09-10T00:00:00.000Z"))
    const res = await sendDueReminders(db, Date.parse("2026-09-10T09:30:00.000Z"))
    expect(res.notifications).toBe(1)
  })

  it("does not send a reminder whose sendAt is still in the future", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, Date.parse("2026-09-10T00:00:00.000Z"))
    const res = await sendDueReminders(db, Date.parse("2026-09-10T08:00:00.000Z"))
    expect(res.sent).toBe(0)
  })
})

describe("task 10.6 — snooze", () => {
  it("re-queues the reminder for the snoozer after the delay", async () => {
    const now = Date.parse("2026-09-10T09:05:00.000Z")
    const { sendAt } = await snoozeReminder(
      db,
      "an",
      {
        itemId: "item1",
        occurrenceKey: null,
        itemTitle: "Họp",
        itemStartAtMs: Date.parse("2026-09-10T09:00:00.000Z"),
        minutes: 30,
      },
      now
    )
    expect(sendAt).toBe(now + 30 * 60_000)
    const rows = await dueFor("item1")
    expect(rows).toHaveLength(1)
    const r = rows[0] as Record<string, unknown>
    expect(r.recipientUids).toEqual(["an"])
    expect(r.status).toBe("pending")
  })

  it("an unread sent reminder stays unread until marked (Nhắc quá giờ vẫn hiển thị)", async () => {
    const { id } = await createItem(
      db,
      MGR,
      timed({ reminders: [{ offsetMinutes: 10, channel: "inapp" }] })
    )
    await recomputeItemReminders(db, id, Date.parse("2026-09-10T00:00:00.000Z"))
    await sendDueReminders(db, Date.parse("2026-09-10T08:55:00.000Z"))
    // the item has since started; nothing auto-reads the notification
    const reminders = await db
      .collection("calendarNotifications")
      .doc("mgr")
      .collection("items")
      .where("kind", "==", "reminder")
      .get()
    expect(reminders.docs.every((d) => d.data().readAt == null)).toBe(true)
    expect(reminders.size).toBeGreaterThanOrEqual(1)
  })
})

describe("task 10.1 — default reminders are copied, not linked", () => {
  it("changing a calendar's defaultReminders does not touch existing items", async () => {
    const { id } = await createItem(db, MGR, timed()) // inherits [30m]
    const before = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(before.reminders).toEqual([{ offsetMinutes: 30, channel: "inapp" }])

    await db
      .collection("calendars")
      .doc(cal)
      .update({ defaultReminders: [{ offsetMinutes: 60, channel: "inapp" }] })

    const after = (await db.collection("calendarItems").doc(id).get()).data()!
    expect(after.reminders).toEqual([{ offsetMinutes: 30, channel: "inapp" }])
  })
})
