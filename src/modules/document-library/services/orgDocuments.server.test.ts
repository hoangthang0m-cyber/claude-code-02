import { beforeEach, describe, expect, it, vi } from "vitest"

const { docSet } = vi.hoisted(() => ({ docSet: vi.fn() }))

vi.mock("@/lib/server/firebaseAdmin", () => {
  let counter = 0
  return {
    getAdminDb: () => ({
      collection: () => ({
        doc: () => ({ id: `orgDocuments-${++counter}`, set: docSet }),
      }),
    }),
    getAdminAuth: () => ({}),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { createOrgDocument } from "@/modules/document-library/services/orgDocuments.server"

const staff: AuthedUser = { uid: "u-staff", email: "s@hemtarot.vn", system_role: "staff" }

const base = {
  category: "meeting_minutes" as const,
  title: "Họp kế hoạch tháng 9",
  url: "https://docs.google.com/document/d/x/edit",
}

beforeEach(() => {
  docSet.mockReset().mockResolvedValue(undefined)
})

describe("createOrgDocument (document-library task 1.2)", () => {
  it("creates an item: category / title / url + created_by + timestamps", async () => {
    const r = await createOrgDocument(staff, base)

    expect(r.id).toMatch(/^orgDocuments-/)
    expect(docSet).toHaveBeenCalledTimes(1)
    const [data] = docSet.mock.calls[0]
    expect(data).toMatchObject({
      category: "meeting_minutes",
      title: "Họp kế hoạch tháng 9",
      url: "https://docs.google.com/document/d/x/edit",
      doc_date: null,
      note: null,
      created_by: "u-staff",
      updated_by: "u-staff",
    })
    expect(data.created_at).toBeDefined()
    expect(data.updated_at).toBeDefined()
  })

  it("stores an optional doc_date and note; trims the title", async () => {
    await createOrgDocument(staff, {
      ...base,
      title: "  Họp tuần  ",
      doc_date: "2026-09-01",
      note: "chốt ngân sách",
    })
    const [data] = docSet.mock.calls[0]
    expect(data).toMatchObject({
      title: "Họp tuần",
      doc_date: "2026-09-01",
      note: "chốt ngân sách",
    })
  })

  it("rejects a missing title with 400", async () => {
    await expect(
      createOrgDocument(staff, { ...base, title: "" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOrgDocument(staff, { ...base, title: "   " })
    ).rejects.toThrow(/title|tiêu đề/i)
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a missing url with 400", async () => {
    await expect(
      createOrgDocument(staff, { category: "org_document", title: "x" })
    ).rejects.toMatchObject({ status: 400 })
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a url without an http(s) scheme (light check, no network)", async () => {
    await expect(
      createOrgDocument(staff, { ...base, url: "docs.google.com/x" })
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      createOrgDocument(staff, { ...base, url: "ftp://host/file" })
    ).rejects.toMatchObject({ status: 400 })
    expect(docSet).not.toHaveBeenCalled()
  })

  it("rejects a category outside the two libraries", async () => {
    await expect(
      createOrgDocument(staff, { ...base, category: "random" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a doc_date that is not YYYY-MM-DD", async () => {
    await expect(
      createOrgDocument(staff, { ...base, doc_date: "01/09/2026" })
    ).rejects.toMatchObject({ status: 400 })
  })
})
