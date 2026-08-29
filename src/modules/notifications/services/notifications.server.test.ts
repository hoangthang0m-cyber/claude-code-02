import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    docs: [] as Array<Record<string, unknown>>,
    clauses: [] as string[],
    byId: {} as Record<string, Record<string, unknown> | undefined>,
    updateSpy: vi.fn(),
    batchUpdateSpy: vi.fn(),
    batchCommitSpy: vi.fn(),
  },
}))

const ts = (ms: number) => ({ toMillis: () => ms })

vi.mock("@/lib/server/firebaseAdmin", () => {
  const docHandle = (id: string) => ({
    ref: { update: (v: unknown) => fx.updateSpy(id, v) },
    update: (v: unknown) => fx.updateSpy(id, v),
    get: async () => {
      const data = fx.byId[id]
      return { exists: data !== undefined, data: () => data }
    },
  })
  const query = (name: string, clauses: string[]) => ({
    where: (f: string, _op: string, v: unknown) => {
      fx.clauses.push(`${f}=${String(v)}`)
      return query(name, [...clauses, f])
    },
    get: async () => ({
      docs: fx.docs.map((d, i) => {
        const id = (d.id as string) ?? `n${i}`
        return {
          id,
          data: () => d,
          ref: { update: (v: unknown) => fx.batchUpdateSpy(id, v) },
        }
      }),
    }),
  })
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: (id: string) => docHandle(id),
      }),
      batch: () => ({
        update: (ref: { update: (v: unknown) => void }, v: unknown) =>
          ref.update(v),
        commit: fx.batchCommitSpy,
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/modules/notifications/services/notifications.server"

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
  fx.byId = {}
  fx.updateSpy.mockReset()
  fx.batchUpdateSpy.mockReset()
  fx.batchCommitSpy.mockReset().mockResolvedValue(undefined)
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

describe("markNotificationRead (SPEC §5.7 R2, task 7.4)", () => {
  it("404 for an unknown id", async () => {
    await expect(markNotificationRead(me, "nope")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("403 for someone else's notification", async () => {
    fx.byId.n1 = note({ recipient_id: "u2" })
    await expect(markNotificationRead(me, "n1")).rejects.toMatchObject({
      status: 403,
    })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("marks an unread notification read", async () => {
    fx.byId.n1 = note({ read_at: null })
    const r = await markNotificationRead(me, "n1")
    expect(r.id).toBe("n1")
    expect(typeof r.read_at).toBe("number")
    expect(fx.updateSpy).toHaveBeenCalledWith("n1", expect.anything())
  })

  it("already read → no write, returns the existing timestamp", async () => {
    fx.byId.n1 = note({ read_at: ts(777) })
    const r = await markNotificationRead(me, "n1")
    expect(r.read_at).toBe(777)
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })
})

describe("markAllNotificationsRead (SPEC §5.7 R2 — 'badge về 0')", () => {
  it("marks every unread one and reports the count", async () => {
    fx.docs = [
      note({ id: "a", read_at: null }),
      note({ id: "b", read_at: ts(1) }),
      note({ id: "c", read_at: null }),
    ]
    const r = await markAllNotificationsRead(me)
    expect(r).toEqual({ marked: 2 })
    expect(fx.batchUpdateSpy.mock.calls.map((c) => c[0]).sort()).toEqual(["a", "c"])
    expect(fx.batchCommitSpy).toHaveBeenCalledTimes(1)
  })

  it("nothing unread → no batch, marked 0", async () => {
    fx.docs = [note({ id: "a", read_at: ts(1) })]
    const r = await markAllNotificationsRead(me)
    expect(r).toEqual({ marked: 0 })
    expect(fx.batchCommitSpy).not.toHaveBeenCalled()
  })
})
