import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    projectId: "p1",
    actorRole: "manager" as "manager" | "staff" | null,
    lifecycle: "running" as "running" | "done" | "archived" | null,
    connExists: true,
    connState: "connected" as string,
    binding: null as Record<string, unknown> | null,
    bindingList: [] as Array<Record<string, unknown>>,
    setSpy: vi.fn(),
    updateSpy: vi.fn(),
    deleteSpy: vi.fn(),
    metricsAccessed: false,
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [{ data: () => ({ project_role: fx.actorRole }) }],
            }
      }
      if (name === "adsBindings") {
        return {
          docs: fx.bindingList.map((b, i) => ({ id: `b${i}`, data: () => b })),
        }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => {
        if (name === "adsMetrics") fx.metricsAccessed = true
        return {
          ...query(name, []),
          doc: (id: string) => ({
            id,
            get: async () => {
              if (name === "contentItems") {
                return {
                  exists: fx.itemExists,
                  data: () => ({ project_id: fx.projectId }),
                }
              }
              if (name === "projects") {
                return {
                  exists: fx.lifecycle != null,
                  data: () => ({ lifecycle: fx.lifecycle }),
                }
              }
              if (name === "adAccountConnections") {
                return {
                  exists: fx.connExists,
                  data: () => ({ state: fx.connState }),
                }
              }
              if (name === "adsBindings") {
                return {
                  exists: fx.binding != null,
                  data: () => fx.binding,
                }
              }
              return { exists: false }
            },
            set: fx.setSpy,
            update: fx.updateSpy,
            delete: fx.deleteSpy,
          }),
        }
      },
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import {
  bindAd,
  listAdsBindings,
  unbindAd,
} from "@/modules/ads-performance/services/adsBindings.server"

const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const validBind = {
  ad_account_id: "act999",
  object_level: "ad",
  object_id: "6300111",
}

beforeEach(() => {
  fx.itemExists = true
  fx.projectId = "p1"
  fx.actorRole = "manager"
  fx.lifecycle = "running"
  fx.connExists = true
  fx.connState = "connected"
  fx.binding = { content_item_id: "c1", object_id: "6300111", active: true }
  fx.bindingList = []
  fx.setSpy.mockReset().mockResolvedValue(undefined)
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
  fx.deleteSpy.mockReset().mockResolvedValue(undefined)
  fx.metricsAccessed = false
})

describe("bindAd (SPEC §5.4 R2)", () => {
  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(bindAd(mgr, "c1", validBind)).rejects.toMatchObject({
      status: 403,
    })
  })

  it("409 when the project is archived", async () => {
    fx.lifecycle = "archived"
    await expect(bindAd(mgr, "c1", validBind)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("400 when the ad account is not connected", async () => {
    fx.connExists = false
    await expect(bindAd(mgr, "c1", validBind)).rejects.toMatchObject({
      status: 400,
    })
  })

  it("409 when the connected account needs reconnecting", async () => {
    fx.connState = "needs_reconnect"
    await expect(bindAd(mgr, "c1", validBind)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("writes an active binding with a deterministic id", async () => {
    const r = await bindAd(mgr, "c1", validBind)
    expect(r.id).toBe("c1__6300111")
    const [written, opts] = fx.setSpy.mock.calls[0]
    expect(written).toMatchObject({
      content_item_id: "c1",
      ad_account_id: "act999",
      object_level: "ad",
      object_id: "6300111",
      active: true,
      unbound_at: null,
    })
    expect(opts).toEqual({ merge: true })
  })
})

describe("unbindAd (SPEC §5.4 R2: keep history, mark stopped)", () => {
  it("soft-deletes — flips active, stamps unbound_at, never deletes", async () => {
    const r = await unbindAd(mgr, "c1", "6300111")
    expect(r).toEqual({ id: "c1__6300111", active: false })
    expect(fx.updateSpy.mock.calls[0][0]).toMatchObject({ active: false })
    expect(fx.updateSpy.mock.calls[0][0].unbound_at).toBeDefined()
    expect(fx.deleteSpy).not.toHaveBeenCalled()
    // never touches AdsMetric history
    expect(fx.metricsAccessed).toBe(false)
  })

  it("404 when there is no such binding", async () => {
    fx.binding = null
    await expect(unbindAd(mgr, "c1", "6300111")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("404 when the binding belongs to another content item", async () => {
    fx.binding = { content_item_id: "other", object_id: "6300111" }
    await expect(unbindAd(mgr, "c1", "6300111")).rejects.toMatchObject({
      status: 404,
    })
  })

  it("403 for a non-manager", async () => {
    fx.actorRole = "staff"
    await expect(unbindAd(mgr, "c1", "6300111")).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe("listAdsBindings", () => {
  it("403 for a non-member", async () => {
    fx.actorRole = null
    await expect(listAdsBindings(mgr, "c1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("returns active bindings first, with the unbound timestamp", async () => {
    fx.bindingList = [
      {
        ad_account_id: "act1",
        object_level: "ad",
        object_id: "111",
        active: false,
        unbound_at: { toMillis: () => 1700 },
      },
      {
        ad_account_id: "act1",
        object_level: "campaign",
        object_id: "222",
        active: true,
      },
    ]
    const { bindings } = await listAdsBindings(mgr, "c1")
    expect(bindings.map((b) => b.object_id)).toEqual(["222", "111"])
    expect(bindings[1]).toMatchObject({ active: false, unbound_at: 1700 })
  })
})
