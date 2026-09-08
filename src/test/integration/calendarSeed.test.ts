import { deleteApp, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { seedDefaultSharedCalendars } from "@/lib/server/calendar/calendarSeed"

// Default-calendar seed against the emulator (Mục D task 2.3): four calendars
// exist with the right writeScope, and a re-run changes nothing.

let db: Firestore

beforeAll(() => {
  const app =
    getApps().find((a) => a.name === "calendarSeed-test") ??
    initializeApp({ projectId: "demo-team-calendar" }, "calendarSeed-test")
  db = getFirestore(app)
})

afterAll(async () => {
  const app = getApps().find((a) => a.name === "calendarSeed-test")
  if (app) await deleteApp(app)
})

beforeEach(async () => {
  const snap = await db.collection("calendars").get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
})

describe("seedDefaultSharedCalendars", () => {
  it("creates the four shared calendars with the spec writeScopes", async () => {
    const r = await seedDefaultSharedCalendars(db)
    expect(r).toEqual({ created: 4, existed: 0 })

    const byId = new Map(
      (await db.collection("calendars").get()).docs.map((d) => [d.id, d.data()])
    )
    expect(byId.get("default_goals")).toMatchObject({
      name: "Mục tiêu phòng",
      writeScope: "managerOnly",
      kind: "shared",
      ownerUid: null,
    })
    for (const id of ["default_campaigns", "default_content", "default_ads"]) {
      expect(byId.get(id)?.writeScope).toBe("everyone")
      expect(byId.get(id)?.kind).toBe("shared")
    }
    expect(byId.get("default_goals")?.defaultReminders).toEqual([
      { offsetMinutes: 1440, channel: "inapp" },
    ])
  })

  it("is non-destructive on a re-run", async () => {
    await seedDefaultSharedCalendars(db)
    await db.collection("calendars").doc("default_ads").set(
      { name: "Quảng cáo (đã đổi tên)" },
      { merge: true }
    )

    const r = await seedDefaultSharedCalendars(db)
    expect(r).toEqual({ created: 0, existed: 4 })
    expect(
      (await db.collection("calendars").doc("default_ads").get()).data()?.name
    ).toBe("Quảng cáo (đã đổi tên)")
  })
})
