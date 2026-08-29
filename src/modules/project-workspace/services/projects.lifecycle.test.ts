import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    memberDocs: [] as Array<Record<string, unknown>>,
    projectExists: true,
    projectData: {} as Record<string, unknown>,
    docUpdate: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const makeCollection = (name: string) => {
    const ref: Record<string, unknown> = {
      doc: () => ({
        get: async () => ({
          exists: fx.projectExists,
          data: () => fx.projectData,
        }),
        update: fx.docUpdate,
      }),
      where: () => ref,
      limit: () => ref,
      get: async () => {
        const docs =
          name === "projectMembers"
            ? fx.memberDocs.map((d) => ({ data: () => d }))
            : []
        return { empty: docs.length === 0, docs }
      },
    }
    return ref
  }
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({ collection: (n: string) => makeCollection(n) }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { changeProjectLifecycle } from "@/modules/project-workspace/services/projects.server"

const actor: AuthedUser = { uid: "u-mgr", email: null, system_role: "staff" }

beforeEach(() => {
  fx.memberDocs = [{ project_role: "manager", skill_tag: null }]
  fx.projectExists = true
  fx.projectData = { lifecycle: "running", retrospective: "" }
  fx.docUpdate.mockReset().mockResolvedValue(undefined)
})

describe("changeProjectLifecycle (SPEC §5.1 R3)", () => {
  it("rejects a staff member with 403", async () => {
    fx.memberDocs = [{ project_role: "staff" }]
    await expect(
      changeProjectLifecycle(actor, "p1", { lifecycle: "done" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("rejects an invalid lifecycle value with 400", async () => {
    await expect(
      changeProjectLifecycle(actor, "p1", { lifecycle: "paused" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a no-op same-state transition with 400", async () => {
    await expect(
      changeProjectLifecycle(actor, "p1", { lifecycle: "running" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects an illegal transition (archived→done) with 409", async () => {
    fx.projectData = { lifecycle: "archived" }
    await expect(
      changeProjectLifecycle(actor, "p1", { lifecycle: "done" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("completes to done and prompts for the retrospective when empty", async () => {
    const result = await changeProjectLifecycle(actor, "p1", { lifecycle: "done" })
    expect(result).toMatchObject({
      lifecycle: "done",
      retrospective_reminder: true,
      background_sync_active: false,
    })
    const [patch] = fx.docUpdate.mock.calls[0]
    expect(patch).toMatchObject({ lifecycle: "done", updated_by: "u-mgr" })
  })

  it("does not prompt for the retrospective when it is already filled", async () => {
    fx.projectData = { lifecycle: "running", retrospective: "Đã có đúc kết" }
    const result = await changeProjectLifecycle(actor, "p1", { lifecycle: "done" })
    expect(result.retrospective_reminder).toBe(false)
  })

  it("archiving reports background sync stopped", async () => {
    const result = await changeProjectLifecycle(actor, "p1", {
      lifecycle: "archived",
    })
    expect(result.background_sync_active).toBe(false)
  })

  it("restores an archived project to running", async () => {
    fx.projectData = { lifecycle: "archived" }
    const result = await changeProjectLifecycle(actor, "p1", {
      lifecycle: "running",
    })
    expect(result).toMatchObject({
      lifecycle: "running",
      background_sync_active: true,
    })
  })

  it("returns 404 when the project does not exist", async () => {
    fx.projectExists = false
    await expect(
      changeProjectLifecycle(actor, "p1", { lifecycle: "done" })
    ).rejects.toMatchObject({ status: 404 })
  })
})
