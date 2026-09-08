import { readFileSync } from "node:fs"

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

// Firestore Security Rules for the Team Activity Calendar
// (docs/team-activity-calendar-spec.md — Mục C §6). Covers the permission
// matrix from Mục B `calendar-access-control` + `item-assignees` §"Quyền chỉnh
// sửa gắn với người đảm nhận" (Mục D tasks 1.3 / 9.6 / 11.5).
//
// Needs the Firestore emulator — run via `npm run test:rules`.

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
const [HOST, PORT] = EMULATOR.split(":")

let testEnv: RulesTestEnvironment

// A calendarItem payload the create rule accepts (createdBy + a writable
// calendar). Other fields are validated server-side, not by rules.
function itemDoc(overrides: Record<string, unknown> = {}) {
  return {
    calendarId: "calEveryone",
    type: "task",
    title: "",
    description: null,
    location: null,
    allDay: false,
    startAt: new Date("2026-09-10T02:00:00Z"),
    endAt: new Date("2026-09-10T03:00:00Z"),
    startDay: "2026-09-10",
    endDay: "2026-09-10",
    spanDays: 1,
    dayKeys: ["2026-09-10"],
    isLongSpan: false,
    isRecurring: false,
    colorOverride: null,
    assigneeIds: [],
    primaryAssigneeId: null,
    linkedProjectId: null,
    linkedContentItemId: null,
    reminders: [],
    recurrence: null,
    recurrenceId: null,
    createdBy: "manager1",
    deletedAt: null,
    ...overrides,
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-team-calendar",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: HOST,
      port: Number(PORT),
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, "members/manager1"), {
      uid: "manager1",
      displayName: "Quản",
      photoURL: null,
      role: "manager",
      active: true,
    })
    await setDoc(doc(db, "members/staff1"), {
      uid: "staff1",
      displayName: "An",
      photoURL: null,
      role: "staff",
      active: true,
    })
    await setDoc(doc(db, "members/staff2"), {
      uid: "staff2",
      displayName: "Bình",
      photoURL: null,
      role: "staff",
      active: true,
    })
    await setDoc(doc(db, "members/inactive1"), {
      uid: "inactive1",
      displayName: "Cũ",
      photoURL: null,
      role: "staff",
      active: false,
    })

    await setDoc(doc(db, "calendars/calEveryone"), {
      name: "Nội dung",
      color: "peacock",
      description: null,
      kind: "shared",
      ownerUid: null,
      writeScope: "everyone",
      defaultReminders: [],
      archived: false,
    })
    await setDoc(doc(db, "calendars/calManagerOnly"), {
      name: "Mục tiêu phòng",
      color: "grape",
      description: null,
      kind: "shared",
      ownerUid: null,
      writeScope: "managerOnly",
      defaultReminders: [],
      archived: false,
    })
    await setDoc(doc(db, "calendars/calArchived"), {
      name: "Chiến dịch cũ",
      color: "tomato",
      description: null,
      kind: "shared",
      ownerUid: null,
      writeScope: "everyone",
      defaultReminders: [],
      archived: true,
    })

    await setDoc(doc(db, "config/calendarSettings"), {
      timezone: "Asia/Ho_Chi_Minh",
      weekStartsOn: 1,
      defaultView: "week",
    })

    await setDoc(
      doc(db, "calendarItems/itemByManager"),
      itemDoc({ createdBy: "manager1" })
    )
    await setDoc(
      doc(db, "calendarItems/itemByStaff1"),
      itemDoc({ createdBy: "staff1" })
    )
    await setDoc(
      doc(db, "calendarItems/itemAssignedStaff1"),
      itemDoc({ createdBy: "manager1", assigneeIds: ["staff1"], primaryAssigneeId: "staff1" })
    )
    await setDoc(
      doc(db, "calendarItems/itemInManagerCal"),
      itemDoc({
        calendarId: "calManagerOnly",
        createdBy: "manager1",
        assigneeIds: ["staff1"],
        primaryAssigneeId: "staff1",
      })
    )
    await setDoc(
      doc(db, "calendarItems/itemInArchivedCal"),
      itemDoc({ calendarId: "calArchived", createdBy: "manager1" })
    )
    await setDoc(
      doc(db, "calendarItems/itemAssignedStaff1/exceptions/2026-09-17"),
      { action: "cancelled", overrides: {}, originalStartAt: new Date("2026-09-17T02:00:00Z") }
    )

    await setDoc(doc(db, "dueReminders/dr1"), {
      itemId: "itemByManager",
      occurrenceKey: "single",
      recipientUids: ["manager1"],
      sendAt: new Date("2026-09-10T01:50:00Z"),
      channel: "inapp",
      status: "pending",
      title: "",
      startAt: new Date("2026-09-10T02:00:00Z"),
    })
  })
})

const asManager = () => testEnv.authenticatedContext("manager1").firestore()
const asStaff1 = () => testEnv.authenticatedContext("staff1").firestore()
const asStaff2 = () => testEnv.authenticatedContext("staff2").firestore()
const asInactive = () => testEnv.authenticatedContext("inactive1").firestore()
const asNonMember = () => testEnv.authenticatedContext("stranger").firestore()
const asAnon = () => testEnv.unauthenticatedContext().firestore()

describe("read access", () => {
  it("members read calendars, items, config, members", async () => {
    await assertSucceeds(getDoc(doc(asStaff1(), "calendars/calEveryone")))
    await assertSucceeds(getDoc(doc(asStaff1(), "calendars/calManagerOnly")))
    await assertSucceeds(getDoc(doc(asStaff1(), "calendarItems/itemByManager")))
    await assertSucceeds(getDoc(doc(asStaff1(), "config/calendarSettings")))
    await assertSucceeds(getDoc(doc(asStaff1(), "members/manager1")))
  })

  it("a staff can read an item in a managerOnly calendar (view is not a security boundary)", async () => {
    await assertSucceeds(getDoc(doc(asStaff1(), "calendarItems/itemInManagerCal")))
  })

  it("non-member is blocked from reading", async () => {
    await assertFails(getDoc(doc(asNonMember(), "calendars/calEveryone")))
    await assertFails(getDoc(doc(asNonMember(), "calendarItems/itemByManager")))
    await assertFails(getDoc(doc(asNonMember(), "config/calendarSettings")))
  })

  it("inactive member is blocked from reading", async () => {
    await assertFails(getDoc(doc(asInactive(), "calendarItems/itemByManager")))
  })

  it("anonymous is blocked from reading", async () => {
    await assertFails(getDoc(doc(asAnon(), "calendarItems/itemByManager")))
  })

  it("dueReminders is never client-readable", async () => {
    await assertFails(getDoc(doc(asManager(), "dueReminders/dr1")))
    await assertFails(getDoc(doc(asStaff1(), "dueReminders/dr1")))
  })
})

describe("calendarItems — create", () => {
  it("staff creates in a writeScope=everyone calendar (createdBy = self)", async () => {
    await assertSucceeds(
      setDoc(doc(asStaff1(), "calendarItems/new1"), itemDoc({ createdBy: "staff1" }))
    )
  })

  it("staff cannot create in a managerOnly calendar", async () => {
    await assertFails(
      setDoc(
        doc(asStaff1(), "calendarItems/new2"),
        itemDoc({ calendarId: "calManagerOnly", createdBy: "staff1" })
      )
    )
  })

  it("manager can create in a managerOnly calendar", async () => {
    await assertSucceeds(
      setDoc(
        doc(asManager(), "calendarItems/new3"),
        itemDoc({ calendarId: "calManagerOnly", createdBy: "manager1" })
      )
    )
  })

  it("cannot create with createdBy != caller", async () => {
    await assertFails(
      setDoc(doc(asStaff1(), "calendarItems/new4"), itemDoc({ createdBy: "manager1" }))
    )
  })

  it("non-member cannot create", async () => {
    await assertFails(
      setDoc(doc(asNonMember(), "calendarItems/new5"), itemDoc({ createdBy: "stranger" }))
    )
  })
})

describe("calendarItems — update / soft delete", () => {
  it("manager can edit any item", async () => {
    await assertSucceeds(
      updateDoc(doc(asManager(), "calendarItems/itemByStaff1"), { title: "Sửa bởi quản lý" })
    )
  })

  it("staff can edit an item they created", async () => {
    await assertSucceeds(
      updateDoc(doc(asStaff1(), "calendarItems/itemByStaff1"), { title: "Tự sửa" })
    )
  })

  it("staff can edit an item they are assigned to (created by someone else)", async () => {
    await assertSucceeds(
      updateDoc(doc(asStaff1(), "calendarItems/itemAssignedStaff1"), {
        startAt: new Date("2026-09-10T05:00:00Z"),
      })
    )
  })

  it("staff cannot edit an item they neither created nor are assigned to", async () => {
    await assertFails(
      updateDoc(doc(asStaff2(), "calendarItems/itemByStaff1"), { title: "Không được" })
    )
    await assertFails(
      updateDoc(doc(asStaff2(), "calendarItems/itemAssignedStaff1"), { title: "Không được" })
    )
  })

  it("staff assignee still cannot edit an item in a managerOnly calendar", async () => {
    await assertFails(
      updateDoc(doc(asStaff1(), "calendarItems/itemInManagerCal"), { title: "Không được" })
    )
  })

  it("staff cannot move their item into a managerOnly calendar", async () => {
    await assertFails(
      updateDoc(doc(asStaff1(), "calendarItems/itemByStaff1"), {
        calendarId: "calManagerOnly",
      })
    )
  })

  it("staff soft-deletes their own item via deletedAt (allowed)", async () => {
    await assertSucceeds(
      updateDoc(doc(asStaff1(), "calendarItems/itemByStaff1"), {
        deletedAt: new Date(),
      })
    )
  })
})

describe("archived calendar → items read-only (task 4.5)", () => {
  it("a manager cannot edit an item in an archived calendar", async () => {
    await assertFails(
      updateDoc(doc(asManager(), "calendarItems/itemInArchivedCal"), {
        title: "Không sửa được",
      })
    )
  })

  it("a manager cannot hard-delete an item in an archived calendar", async () => {
    await assertFails(
      deleteDoc(doc(asManager(), "calendarItems/itemInArchivedCal"))
    )
  })

  it("nobody can create an item in an archived calendar", async () => {
    await assertFails(
      setDoc(
        doc(asManager(), "calendarItems/newInArchived"),
        itemDoc({ calendarId: "calArchived", createdBy: "manager1" })
      )
    )
  })

  it("items in an archived calendar are still readable", async () => {
    await assertSucceeds(
      getDoc(doc(asStaff1(), "calendarItems/itemInArchivedCal"))
    )
  })
})

describe("calendarItems — hard delete", () => {
  it("staff cannot hard-delete, even their own item", async () => {
    await assertFails(deleteDoc(doc(asStaff1(), "calendarItems/itemByStaff1")))
    await assertFails(deleteDoc(doc(asStaff1(), "calendarItems/itemAssignedStaff1")))
  })

  it("manager can hard-delete", async () => {
    await assertSucceeds(deleteDoc(doc(asManager(), "calendarItems/itemByStaff1")))
  })
})

describe("recurrence exceptions", () => {
  it("staff assignee of the master can write an exception", async () => {
    await assertSucceeds(
      setDoc(
        doc(asStaff1(), "calendarItems/itemAssignedStaff1/exceptions/2026-09-24"),
        { action: "cancelled", overrides: {}, originalStartAt: new Date("2026-09-24T02:00:00Z") }
      )
    )
  })

  it("a non-editor cannot write an exception", async () => {
    await assertFails(
      setDoc(
        doc(asStaff2(), "calendarItems/itemAssignedStaff1/exceptions/2026-09-24"),
        { action: "cancelled", overrides: {}, originalStartAt: new Date("2026-09-24T02:00:00Z") }
      )
    )
  })

  it("any member can read an exception", async () => {
    await assertSucceeds(
      getDoc(doc(asStaff2(), "calendarItems/itemAssignedStaff1/exceptions/2026-09-17"))
    )
  })
})

describe("calendars — manager only", () => {
  it("staff cannot create a sub-calendar", async () => {
    await assertFails(
      setDoc(doc(asStaff1(), "calendars/calNew"), {
        name: "Của nhân sự",
        color: "sage",
        description: null,
        kind: "shared",
        ownerUid: null,
        writeScope: "everyone",
        defaultReminders: [],
        archived: false,
      })
    )
  })

  it("manager can create a sub-calendar", async () => {
    await assertSucceeds(
      setDoc(doc(asManager(), "calendars/calNew"), {
        name: "Sự kiện",
        color: "sage",
        description: null,
        kind: "shared",
        ownerUid: null,
        writeScope: "everyone",
        defaultReminders: [],
        archived: false,
      })
    )
  })

  it("staff cannot rename a sub-calendar", async () => {
    await assertFails(
      updateDoc(doc(asStaff1(), "calendars/calEveryone"), { name: "Đổi tên" })
    )
  })
})

describe("config / members — server-owned", () => {
  it("no client can write config/calendarSettings", async () => {
    await assertFails(
      updateDoc(doc(asManager(), "config/calendarSettings"), { defaultView: "day" })
    )
  })

  it("no client can write their own member doc", async () => {
    await assertFails(
      updateDoc(doc(asStaff1(), "members/staff1"), { role: "manager" })
    )
  })
})

describe("userCalendarPrefs — owner only", () => {
  it("owner reads and writes their prefs", async () => {
    await assertSucceeds(
      setDoc(doc(asStaff1(), "userCalendarPrefs/staff1"), {
        uid: "staff1",
        hidden: ["calEveryone"],
        colorOverrides: {},
      })
    )
    await assertSucceeds(getDoc(doc(asStaff1(), "userCalendarPrefs/staff1")))
  })

  it("cannot touch another person's prefs", async () => {
    await assertFails(
      setDoc(doc(asStaff2(), "userCalendarPrefs/staff1"), {
        uid: "staff1",
        hidden: [],
        colorOverrides: {},
      })
    )
    await assertFails(getDoc(doc(asStaff2(), "userCalendarPrefs/staff1")))
  })
})

describe("dueReminders — server only", () => {
  it("no client can write dueReminders", async () => {
    await assertFails(
      setDoc(doc(asManager(), "dueReminders/dr2"), {
        itemId: "x",
        occurrenceKey: "single",
        recipientUids: [],
        sendAt: new Date(),
        channel: "inapp",
        status: "pending",
        title: "",
        startAt: new Date(),
      })
    )
  })
})

// Sanity: the seeded item shape has the isRecurring field the index relies on.
it("seeded items carry isRecurring", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await getDoc(doc(ctx.firestore(), "calendarItems/itemByManager"))
    expect(snap.data()?.isRecurring).toBe(false)
  })
})
