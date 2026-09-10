import { beforeEach, describe, expect, it, vi } from "vitest"

// Xoá hạng mục nội dung — ngoài phạm vi docs/SPEC.md, bổ sung theo yêu cầu
// người dùng. Dùng fake Firestore có trạng thái để kiểm chứng cả phân quyền
// lẫn việc dọn sạch dữ liệu treo vào hạng mục.

type Doc = Record<string, unknown>
const store = new Map<string, Map<string, Doc>>()
const col = (n: string) => {
  if (!store.has(n)) store.set(n, new Map())
  return store.get(n)!
}

type Filter = [string, string, unknown]
const matches = (d: Doc, fs: Filter[]) =>
  fs.every(([f, op, v]) => (op === "==" ? d[f] === v : true))

function q(name: string, fs: Filter[]) {
  return {
    where: (f: string, o: string, v: unknown) => q(name, [...fs, [f, o, v]]),
    limit: () => q(name, fs),
    get: async () => {
      const docs = [...col(name).entries()]
        .filter(([, d]) => matches(d, fs))
        .map(([id, d]) => ({ id, ref: ref(name, id), data: () => d }))
      return { docs, empty: docs.length === 0, size: docs.length }
    },
  }
}

function ref(name: string, id: string) {
  return {
    id,
    name,
    path: `${name}/${id}`,
    get: async () => ({
      exists: col(name).has(id),
      id,
      data: () => col(name).get(id),
    }),
    set: async (d: Doc) => void col(name).set(id, d),
    update: async (d: Doc) =>
      void col(name).set(id, { ...(col(name).get(id) ?? {}), ...d }),
    delete: async () => void col(name).delete(id),
  }
}

const fakeDb = {
  collection: (name: string) => ({
    ...q(name, []),
    doc: (id?: string) => ref(name, id ?? `${name}-auto`),
  }),
  batch: () => {
    const ops: Array<() => void> = []
    return {
      delete: (r: { name: string; id: string }) =>
        ops.push(() => col(r.name).delete(r.id)),
      commit: async () => ops.forEach((f) => f()),
    }
  },
}

vi.mock("@/lib/server/firebaseAdmin", () => ({ getAdminDb: () => fakeDb }))
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: () => "__ts__" },
  Timestamp: { fromDate: (d: Date) => ({ _seconds: d.getTime() / 1000 }) },
}))

import type { AuthedUser } from "@/lib/server/auth"
import { deleteContentItem } from "@/modules/content-pipeline/services/content.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

function seed({
  role = "manager",
  lifecycle = "running",
}: { role?: "manager" | "staff" | null; lifecycle?: string } = {}) {
  store.clear()
  col("projects").set("p1", { name: "UGC", lifecycle })
  if (role) {
    col("projectMembers").set("p1__u1", {
      project_id: "p1",
      user_id: "u1",
      project_role: role,
    })
  }
  col("contentItems").set("c1", { project_id: "p1", code: "V001" })
  col("contentItems").set("c2", { project_id: "p1", code: "V002" })

  // dữ liệu treo vào c1
  col("comments").set("cm1", { content_item_id: "c1" })
  col("comments").set("cm2", { content_item_id: "c1" })
  col("statusHistory").set("sh1", { content_item_id: "c1" })
  col("adsBindings").set("ab1", { content_item_id: "c1" })
  col("adsMetrics").set("am1", { content_item_id: "c1" })
  col("notifications").set("n1", { content_item_id: "c1" })
  col("referenceLinks").set("rl1", {
    owner_type: "content_item",
    owner_id: "c1",
  })
  // của hạng mục khác + của chính dự án — không được đụng tới
  col("comments").set("cm9", { content_item_id: "c2" })
  col("referenceLinks").set("rl9", { owner_type: "project", owner_id: "p1" })
}

beforeEach(() => seed())

describe("deleteContentItem", () => {
  it("từ chối người ngoài dự án bằng 403", async () => {
    seed({ role: null })
    await expect(
      deleteContentItem(actor, "c1", { confirm_code: "V001" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("từ chối nhân viên không phải manager dự án bằng 403", async () => {
    seed({ role: "staff" })
    await expect(
      deleteContentItem(actor, "c1", { confirm_code: "V001" })
    ).rejects.toMatchObject({ status: 403 })
    expect(col("contentItems").has("c1")).toBe(true)
  })

  it("từ chối khi dự án đã lưu trữ bằng 409", async () => {
    seed({ lifecycle: "archived" })
    await expect(
      deleteContentItem(actor, "c1", { confirm_code: "V001" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("trả 404 khi không có hạng mục", async () => {
    await expect(
      deleteContentItem(actor, "khong-ton-tai", { confirm_code: "V001" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("từ chối khi mã xác nhận không khớp", async () => {
    await expect(
      deleteContentItem(actor, "c1", { confirm_code: "V002" })
    ).rejects.toMatchObject({ status: 400 })
    expect(col("contentItems").has("c1")).toBe(true)
  })

  it("manager xoá được, kéo theo mọi dữ liệu treo vào hạng mục", async () => {
    const r = await deleteContentItem(actor, "c1", { confirm_code: "V001" })

    expect(col("contentItems").has("c1")).toBe(false)
    expect(col("comments").has("cm1")).toBe(false)
    expect(col("comments").has("cm2")).toBe(false)
    expect(col("statusHistory").has("sh1")).toBe(false)
    expect(col("adsBindings").has("ab1")).toBe(false)
    expect(col("adsMetrics").has("am1")).toBe(false)
    expect(col("notifications").has("n1")).toBe(false)
    expect(col("referenceLinks").has("rl1")).toBe(false)

    // 2 bình luận + 1 lịch sử + 1 binding + 1 metric + 1 thông báo + 1 link + hạng mục
    expect(r).toEqual({ id: "c1", docs_deleted: 8 })
  })

  it("không đụng tới hạng mục khác và link của chính dự án", async () => {
    await deleteContentItem(actor, "c1", { confirm_code: "V001" })
    expect(col("contentItems").has("c2")).toBe(true)
    expect(col("comments").has("cm9")).toBe(true)
    expect(col("referenceLinks").has("rl9")).toBe(true)
  })

  it("chấp nhận mã xác nhận có khoảng trắng thừa", async () => {
    await expect(
      deleteContentItem(actor, "c1", { confirm_code: "  V001  " })
    ).resolves.toMatchObject({ id: "c1" })
  })
})
