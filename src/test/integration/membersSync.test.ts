import {
  deleteApp,
  getApps,
  initializeApp,
} from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  ensurePersonalCalendar,
  reconcileAllMembers,
  syncSelfMember,
} from "@/lib/server/calendar/membersSync"

// Member sync against the Firestore emulator (docs/team-activity-calendar-spec.md
// — Mục D tasks 2.1 / 2.2 / 2.4). Run via `npm run test:emulator`.
// firebase-admin talks to the emulator via FIRESTORE_EMULATOR_HOST (set by
// firebase emulators:exec) and needs no real credentials for a demo project.

let db: Firestore

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "membersSync-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "membersSync-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "membersSync-test")
  if (app) await deleteApp(app)
})

async function wipe() {
  for (const c of ["users", "members", "calendars"]) {
    const snap = await db.collection(c).get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  }
}

beforeEach(wipe)

async function seedUser(uid: string, data: Record<string, unknown>) {
  await db.collection("users").doc(uid).set(data)
}

describe("syncSelfMember (task 2.1)", () => {
  it("creates members/{uid} projected from the users/ doc", async () => {
    await seedUser("u1", {
      name: "Nguyễn An",
      email: "an@hem.vn",
      system_role: "manager",
      avatar: "https://x/a.png",
    })

    const r = await syncSelfMember(db, {
      uid: "u1",
      email: "an@hem.vn",
      system_role: "manager",
    })
    expect(r.memberCreated).toBe(true)

    const m = (await db.collection("members").doc("u1").get()).data()
    expect(m).toMatchObject({
      uid: "u1",
      displayName: "Nguyễn An",
      photoURL: "https://x/a.png",
      role: "manager",
      active: true,
    })
    expect(m?.updatedAt).toBeDefined()
  })

  it("re-syncs role / name drift and does not re-create", async () => {
    await seedUser("u1", { name: "An", email: "an@hem.vn", system_role: "staff" })
    await syncSelfMember(db, { uid: "u1", email: "an@hem.vn", system_role: "staff" })

    await db.collection("users").doc("u1").set(
      { name: "An (Lead)", system_role: "manager" },
      { merge: true }
    )
    const r = await syncSelfMember(db, {
      uid: "u1",
      email: "an@hem.vn",
      system_role: "manager",
    })

    expect(r.memberCreated).toBe(false)
    const m = (await db.collection("members").doc("u1").get()).data()
    expect(m?.displayName).toBe("An (Lead)")
    expect(m?.role).toBe("manager")
  })

  it("falls back to the auth token when the users/ doc is missing", async () => {
    const r = await syncSelfMember(db, {
      uid: "u2",
      email: "late@hem.vn",
      system_role: "staff",
    })
    expect(r.memberCreated).toBe(true)
    const m = (await db.collection("members").doc("u2").get()).data()
    expect(m?.displayName).toBe("late")
    expect(m?.role).toBe("staff")
  })
})

describe("personal calendar (task 2.4)", () => {
  it("first sync creates exactly one personal calendar, second creates none", async () => {
    await seedUser("u1", { name: "An", email: "an@hem.vn", system_role: "staff" })

    const r1 = await syncSelfMember(db, {
      uid: "u1",
      email: "an@hem.vn",
      system_role: "staff",
    })
    expect(r1.personalCalendarCreated).toBe(true)

    const r2 = await syncSelfMember(db, {
      uid: "u1",
      email: "an@hem.vn",
      system_role: "staff",
    })
    expect(r2.personalCalendarCreated).toBe(false)

    const cals = await db
      .collection("calendars")
      .where("kind", "==", "personal")
      .where("ownerUid", "==", "u1")
      .get()
    expect(cals.size).toBe(1)
    expect(cals.docs[0].data()).toMatchObject({
      name: "An",
      kind: "personal",
      ownerUid: "u1",
      writeScope: "everyone",
      archived: false,
    })
  })

  it("ensurePersonalCalendar is idempotent when called directly", async () => {
    expect(await ensurePersonalCalendar(db, "u9", "Chín")).toBe(true)
    expect(await ensurePersonalCalendar(db, "u9", "Chín")).toBe(false)
  })
})

describe("reconcileAllMembers (task 2.2)", () => {
  it("mirrors every users/ doc and the active member count matches", async () => {
    await seedUser("u1", { name: "An", email: "an@hem.vn", system_role: "manager" })
    await seedUser("u2", { name: "Bình", email: "binh@hem.vn", system_role: "staff" })
    await seedUser("u3", { name: "Cường", email: "cuong@hem.vn", system_role: "staff" })

    const r = await reconcileAllMembers(db)
    expect(r.usersScanned).toBe(3)
    expect(r.membersCreated).toBe(3)
    expect(r.personalCalendarsCreated).toBe(3)

    const activeMembers = await db
      .collection("members")
      .where("active", "==", true)
      .get()
    expect(activeMembers.size).toBe(3)
  })

  it("deactivates a member whose users/ doc is gone", async () => {
    await seedUser("u1", { name: "An", email: "an@hem.vn", system_role: "staff" })
    await seedUser("u2", { name: "Bình", email: "binh@hem.vn", system_role: "staff" })
    await reconcileAllMembers(db)

    await db.collection("users").doc("u2").delete()
    const r = await reconcileAllMembers(db)

    expect(r.deactivated).toBe(1)
    expect((await db.collection("members").doc("u2").get()).data()?.active).toBe(false)
    expect((await db.collection("members").doc("u1").get()).data()?.active).toBe(true)
  })

  it("is idempotent — a second run creates nothing new", async () => {
    await seedUser("u1", { name: "An", email: "an@hem.vn", system_role: "staff" })
    await reconcileAllMembers(db)
    const r = await reconcileAllMembers(db)
    expect(r.membersCreated).toBe(0)
    expect(r.personalCalendarsCreated).toBe(0)
    expect(r.membersUpdated).toBe(1)
  })
})
