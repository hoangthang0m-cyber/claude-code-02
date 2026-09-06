import { beforeEach, describe, expect, it, vi } from "vitest"

// ── in-memory Firestore fake ──────────────────────────────────────────────

type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()

function col(name: string): Map<string, Doc> {
  if (!store.has(name)) store.set(name, new Map())
  return store.get(name)!
}

type Filter = [string, string, unknown]

function matches(data: Doc, filters: Filter[]): boolean {
  return filters.every(([field, op, value]) => {
    const v = data[field]
    if (op === "==") return v === value
    if (op === ">=") return String(v) >= String(value)
    if (op === "<=") return String(v) <= String(value)
    return false
  })
}

function makeQuery(name: string, filters: Filter[], cap: number | null) {
  return {
    where: (f: string, o: string, v: unknown) =>
      makeQuery(name, [...filters, [f, o, v]], cap),
    limit: (n: number) => makeQuery(name, filters, n),
    orderBy: () => makeQuery(name, filters, cap),
    get: async () => {
      let entries = [...col(name).entries()].filter(([, d]) => matches(d, filters))
      if (cap != null) entries = entries.slice(0, cap)
      const docs = entries.map(([id, d]) => ({
        id,
        ref: docRef(name, id),
        data: () => d,
        exists: true,
      }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}

function docRef(name: string, id: string) {
  return {
    id,
    get name() {
      return name
    },
    get: async () => {
      const d = col(name).get(id)
      return { exists: d !== undefined, id, data: () => d, ref: docRef(name, id) }
    },
    set: async (data: Doc) => void col(name).set(id, data),
    update: async (data: Doc) =>
      void col(name).set(id, { ...(col(name).get(id) ?? {}), ...data }),
    delete: async () => void col(name).delete(id),
  }
}

function collectionRef(name: string) {
  const q = makeQuery(name, [], null)
  return { ...q, doc: (id: string) => docRef(name, id) }
}

const fakeDb = {
  collection: (name: string) => collectionRef(name),
  batch: () => {
    const ops: Array<() => void> = []
    return {
      set: (ref: { name: string; id: string }, data: Doc) =>
        ops.push(() => col(ref.name).set(ref.id, data)),
      update: (ref: { name: string; id: string }, data: Doc) =>
        ops.push(() =>
          col(ref.name).set(ref.id, { ...(col(ref.name).get(ref.id) ?? {}), ...data })
        ),
      delete: (ref: { name: string; id: string }) =>
        ops.push(() => col(ref.name).delete(ref.id)),
      commit: async () => ops.forEach((f) => f()),
    }
  },
}

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => fakeDb,
  getAdminAuth: () => ({}),
}))
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
}))

import type { AuthedUser } from "@/lib/server/auth"
import {
  createProduct,
  deleteProduct,
  setAccountRules,
  setCampaignOverride,
  updateProduct,
} from "@/modules/ads-overview/services/productConfig.server"

const manager: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }

beforeEach(() => {
  store.clear()
  col("products").set("a", { code: "a", name: "An Mệnh Hòa Duyên", keywords: [] })
  col("products").set("t", { code: "t", name: "Tứ Bản Định Mệnh", keywords: [] })
  col("adAccountConnections").set("u-mgr__111", {
    project_owner_id: "u-mgr",
    ad_account_id: "111",
    name: "AMHD - Backup",
  })
})

describe("createProduct (task 2.5)", () => {
  it("rejects a staff account with 403", async () => {
    await expect(
      createProduct(staff, { code: "h", name: "x" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("creates a new product keyed by its code", async () => {
    const r = await createProduct(manager, { code: "H", name: "Hiếu Mệnh Dưỡng Con", keywords: ["hmdc"] })
    expect(r).toEqual({ id: "h" })
    expect(col("products").get("h")).toMatchObject({ code: "h", keywords: ["hmdc"] })
  })

  it("409s a duplicate code", async () => {
    await expect(
      createProduct(manager, { code: "a", name: "dup" })
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe("updateProduct (task 2.5)", () => {
  it("404s an unknown product", async () => {
    await expect(
      updateProduct(manager, "zzz", { name: "x" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("400s an empty patch", async () => {
    await expect(updateProduct(manager, "a", {})).rejects.toMatchObject({
      status: 400,
    })
  })

  it("updates name / keywords", async () => {
    await updateProduct(manager, "a", { keywords: ["amhd"] })
    expect(col("products").get("a")).toMatchObject({ keywords: ["amhd"] })
  })
})

describe("deleteProduct (task 2.5)", () => {
  it("409s while a rule still references it", async () => {
    col("productAccountRules").set("111__a", {
      ad_account_id: "111",
      product_id: "a",
      is_account_default: true,
    })
    await expect(deleteProduct(manager, "a")).rejects.toMatchObject({ status: 409 })
  })

  it("removes an unreferenced product", async () => {
    const r = await deleteProduct(manager, "t")
    expect(r).toMatchObject({ removed: true })
    expect(col("products").has("t")).toBe(false)
  })
})

describe("setAccountRules (task 2.5)", () => {
  it("400s an ad account the manager has not connected", async () => {
    await expect(
      setAccountRules(manager, { ad_account_id: "999", product_ids: ["a"] })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("400s an unknown product id", async () => {
    await expect(
      setAccountRules(manager, { ad_account_id: "111", product_ids: ["nope"] })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("400s a default outside the chosen set", async () => {
    await expect(
      setAccountRules(manager, {
        ad_account_id: "111",
        product_ids: ["a"],
        default_product_id: "t",
      })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("writes one rule per product and marks the default", async () => {
    await setAccountRules(manager, {
      ad_account_id: "111",
      product_ids: ["t", "a"],
      default_product_id: "t",
    })
    expect(col("productAccountRules").get("111__t")).toMatchObject({
      is_account_default: true,
    })
    expect(col("productAccountRules").get("111__a")).toMatchObject({
      is_account_default: false,
    })
  })

  it("replaces a prior rule set, dropping products no longer chosen", async () => {
    col("productAccountRules").set("111__a", {
      ad_account_id: "111",
      product_id: "a",
      is_account_default: true,
    })
    await setAccountRules(manager, { ad_account_id: "111", product_ids: ["t"] })
    expect(col("productAccountRules").has("111__a")).toBe(false)
    expect(col("productAccountRules").get("111__t")).toMatchObject({
      is_account_default: true,
    })
  })
})

describe("setCampaignOverride (task 2.5)", () => {
  it("pins a campaign to a product", async () => {
    const r = await setCampaignOverride(manager, {
      ad_account_id: "111",
      campaign_id: "c1",
      product_id: "t",
    })
    expect(r).toEqual({ id: "111__c1" })
    expect(col("campaignProductOverrides").get("111__c1")).toMatchObject({
      product_id: "t",
      set_by: "u-mgr",
    })
  })

  it("404s a pin to an unknown product", async () => {
    await expect(
      setCampaignOverride(manager, {
        ad_account_id: "111",
        campaign_id: "c1",
        product_id: "zzz",
      })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("clears the pin when product_id is null", async () => {
    col("campaignProductOverrides").set("111__c1", {
      ad_account_id: "111",
      campaign_id: "c1",
      product_id: "t",
    })
    const r = await setCampaignOverride(manager, {
      ad_account_id: "111",
      campaign_id: "c1",
      product_id: null,
    })
    expect(r).toMatchObject({ removed: true })
    expect(col("campaignProductOverrides").has("111__c1")).toBe(false)
  })

  it("rejects staff", async () => {
    await expect(
      setCampaignOverride(staff, {
        ad_account_id: "111",
        campaign_id: "c1",
        product_id: "t",
      })
    ).rejects.toMatchObject({ status: 403 })
  })
})
