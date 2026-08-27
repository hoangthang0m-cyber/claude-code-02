import { beforeEach, describe, expect, it, vi } from "vitest"

const { queryGet } = vi.hoisted(() => ({ queryGet: vi.fn() }))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const chain: Record<string, unknown> = {
    where: () => chain,
    limit: () => chain,
    get: queryGet,
  }
  return {
    getAdminDb: () => ({ collection: () => chain }),
    getAdminAuth: () => ({}),
  }
})

import {
  requireProjectManager,
  requireProjectScope,
  requireSystemManager,
  type ProjectScope,
} from "@/lib/permissions/projectScope"

function membersSnapshot(docs: Array<Record<string, unknown>>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ data: () => d })),
  }
}

beforeEach(() => {
  queryGet.mockReset()
})

describe("requireProjectScope (SPEC §2, §6.5 — the one shared scope check)", () => {
  it("resolves a manager member", async () => {
    queryGet.mockResolvedValue(
      membersSnapshot([{ project_role: "manager", skill_tag: "ads" }])
    )
    await expect(requireProjectScope("u1", "p1")).resolves.toEqual({
      uid: "u1",
      project_id: "p1",
      project_role: "manager",
      skill_tag: "ads",
      is_manager: true,
    })
  })

  it("resolves a staff member (is_manager false)", async () => {
    queryGet.mockResolvedValue(
      membersSnapshot([{ project_role: "staff", skill_tag: "content" }])
    )
    const scope = await requireProjectScope("u2", "p1")
    expect(scope.project_role).toBe("staff")
    expect(scope.is_manager).toBe(false)
    expect(scope.skill_tag).toBe("content")
  })

  it("rejects a non-member with 403 (SPEC §5.1 R4)", async () => {
    queryGet.mockResolvedValue(membersSnapshot([]))
    await expect(requireProjectScope("u3", "p1")).rejects.toMatchObject({
      status: 403,
    })
  })

  it("defaults an unknown project_role to staff (least privilege)", async () => {
    queryGet.mockResolvedValue(membersSnapshot([{ skill_tag: null }]))
    const scope = await requireProjectScope("u4", "p1")
    expect(scope.project_role).toBe("staff")
    expect(scope.skill_tag).toBeNull()
  })
})

const managerScope: ProjectScope = {
  uid: "u1",
  project_id: "p1",
  project_role: "manager",
  skill_tag: null,
  is_manager: true,
}
const staffScope: ProjectScope = {
  ...managerScope,
  project_role: "staff",
  is_manager: false,
}

describe("requireProjectManager (SPEC §2)", () => {
  it("passes for a manager scope", () => {
    expect(() => requireProjectManager(managerScope)).not.toThrow()
  })

  it("throws 403 for a staff scope", () => {
    expect(() => requireProjectManager(staffScope)).toThrowError(
      expect.objectContaining({ status: 403 })
    )
  })
})

describe("requireSystemManager (SPEC §6.9 — project creation)", () => {
  it("passes for system_role manager", () => {
    expect(() =>
      requireSystemManager({ uid: "u", email: null, system_role: "manager" })
    ).not.toThrow()
  })

  it("throws 403 for system_role staff", () => {
    expect(() =>
      requireSystemManager({ uid: "u", email: null, system_role: "staff" })
    ).toThrowError(expect.objectContaining({ status: 403 }))
  })
})
