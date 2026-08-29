import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: { docs: [] as Array<Record<string, unknown>>, clauses: [] as string[] },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) => {
      fx.clauses.push(`${f}=${String(v)}`)
      return query(name, [...clauses, f])
    },
    get: async () => ({
      docs: fx.docs.map((d, i) => ({ id: (d.id as string) ?? `n${i}`, data: () => d })),
    }),
  })
  return {
    getAdminDb: () => ({ collection: (name: string) => query(name, []) }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { listNotifications } from "@/modules/notifications/services/notifications.server"

const me: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

const note = (over: Record<string, unknown> = {}) => ({
  recipient_id: "u1",
  type: "content_assigned",
  message: "x",
  content_item_id: "ci1",
  project_id: "p1",
  read_at: null,
  created_at: ts(1000),
  ...over,
})

beforeEach(() => {
  fx.docs = []
  fx.clauses = []
})

describe("listNotifications (SPEC §5.7 R2, task 7.3)", () => {
  it("scopes the query to the caller", async () => {
    await listNotifications(me)
    expect(fx.clauses).toContain("recipient_id=u1")
  })

  it("returns newest first with the true unread count", async () => {
    fx.docs = [
      note({ id: "old", created_at: ts(100) }),
      note({ id: "new", created_at: ts(900) }),
      note({ id: "read", created_at: ts(500), read_at: ts(600) }),
    ]
    const r = await listNotifications(me)
    expect(r.items.map((n) => n.id)).toEqual(["new", "read", "old"])
    expect(r.unread_count).toBe(2)
  })

  it("badge shows 5 when there are 5 unread — even past the list cap", async () => {
    fx.docs = Array.from({ length: 5 }, (_, i) =>
      note({ id: `u${i}`, created_at: ts(i) })
    )
    const r = await listNotifications(me, { limit: 2 })
    expect(r.items).toHaveLength(2)
    expect(r.unread_count).toBe(5)
  })

  it("serialises timestamps to millis and nulls a missing read_at", async () => {
    fx.docs = [note({ read_at: undefined })]
    const r = await listNotifications(me)
    expect(r.items[0]).toMatchObject({
      created_at: 1000,
      read_at: null,
      content_item_id: "ci1",
      project_id: "p1",
      type: "content_assigned",
    })
  })

  it("clamps the limit (0 → default, huge → 100, negative → default)", async () => {
    fx.docs = Array.from({ length: 150 }, (_, i) =>
      note({ id: `x${i}`, created_at: ts(i) })
    )
    expect((await listNotifications(me, { limit: 0 })).items).toHaveLength(30)
    expect((await listNotifications(me, { limit: 9999 })).items).toHaveLength(100)
    expect((await listNotifications(me, { limit: -3 })).items).toHaveLength(30)
  })

  it("empty inbox → zero count, empty list", async () => {
    const r = await listNotifications(me)
    expect(r).toEqual({ unread_count: 0, items: [] })
  })
})
