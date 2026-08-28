import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    status: "chua_bat_dau" as string,
    actorRole: "staff" as "manager" | "staff" | null,
    lifecycle: "running" as "running" | "done" | "archived" | null,
    updateSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (collection: string, clauses: string[]) => ({
    where: (f: string) => query(collection, [...clauses, f]),
    limit: () => query(collection, clauses),
    get: async () => {
      if (collection === "projectMembers" && clauses.includes("user_id")) {
        return fx.actorRole == null
          ? { empty: true, docs: [] }
          : {
              empty: false,
              docs: [{ data: () => ({ project_role: fx.actorRole }) }],
            }
      }
      return { empty: true, docs: [] }
    },
  })
  return {
    getAdminAuth: () => ({}),
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...query(name, []),
        doc: () => ({
          id: `${name}-1`,
          get: async () => {
            if (name === "contentItems") {
              return {
                exists: fx.itemExists,
                data: () => ({ project_id: "p1", code: "V1", status: fx.status }),
              }
            }
            return {
              exists: fx.lifecycle != null,
              data: () => ({ lifecycle: fx.lifecycle }),
            }
          },
          update: fx.updateSpy,
        }),
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { executeTransition } from "@/modules/production-workflow/services/workflow.server"

const actor: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.itemExists = true
  fx.status = "chua_bat_dau"
  fx.actorRole = "manager"
  fx.lifecycle = "running"
  fx.updateSpy.mockReset().mockResolvedValue(undefined)
})

describe("executeTransition — state-machine gate (SPEC §5.3 R1)", () => {
  it("404 when the item does not exist", async () => {
    fx.itemExists = false
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 404 })
  })

  it("403 when the caller is not a project member", async () => {
    fx.actorRole = null
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("409 when the project is archived", async () => {
    fx.lifecycle = "archived"
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("applies a legal transition and stamps updated_by", async () => {
    const r = await executeTransition(actor, "c1", { to: "viet_kich_ban" })
    expect(r).toEqual({ id: "c1", from: "chua_bat_dau", to: "viet_kich_ban" })
    expect(fx.updateSpy.mock.calls[0][0]).toMatchObject({
      status: "viet_kich_ban",
      updated_by: "u1",
    })
  })

  it("rejects an illegal skip (quay_dung → da_duyet) with 409, no write", async () => {
    fx.status = "quay_dung"
    await expect(
      executeTransition(actor, "c1", { to: "da_duyet" })
    ).rejects.toMatchObject({ status: 409 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a same-state transition with 409", async () => {
    fx.status = "quay_dung"
    await expect(
      executeTransition(actor, "c1", { to: "quay_dung" })
    ).rejects.toMatchObject({ status: 409 })
  })

  it("rejects an unknown target status with 400 (schema)", async () => {
    await expect(
      executeTransition(actor, "c1", { to: "posted" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a return with no reason (SPEC §5.3 R3)", async () => {
    fx.status = "cho_duyet_video"
    await expect(
      executeTransition(actor, "c1", { to: "quay_dung" })
    ).rejects.toMatchObject({ status: 400 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("allows a return when a reason is given", async () => {
    fx.status = "cho_duyet_video"
    const r = await executeTransition(actor, "c1", {
      to: "quay_dung",
      reason: "Âm thanh chưa đạt",
    })
    expect(r.to).toBe("quay_dung")
  })
})
