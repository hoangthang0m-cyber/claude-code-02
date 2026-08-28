import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    itemExists: true,
    status: "chua_bat_dau" as string,
    assigneeId: "u1" as string | null,
    scriptUrl: "https://docs.google.com/document/d/s1" as string | null,
    videoUrl: "https://drive.google.com/file/d/v1" as string | null,
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
                data: () => ({
                  project_id: "p1",
                  code: "V1",
                  status: fx.status,
                  assignee_id: fx.assigneeId,
                  script_url: fx.scriptUrl,
                  video_url: fx.videoUrl,
                }),
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
  fx.assigneeId = "u1"
  fx.scriptUrl = "https://docs.google.com/document/d/s1"
  fx.videoUrl = "https://drive.google.com/file/d/v1"
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

describe("executeTransition — work step ownership + link (SPEC §2, §5.3 R2, task 4.3)", () => {
  it("rejects a work step by someone who is not the assignee (403, no write)", async () => {
    fx.status = "chua_bat_dau"
    fx.assigneeId = "u2"
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 403 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a work step on an unassigned item (403)", async () => {
    fx.status = "chua_bat_dau"
    fx.assigneeId = null
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 403 })
  })

  it("lets the assignee run a work step", async () => {
    fx.status = "chua_bat_dau"
    fx.assigneeId = "u1"
    const r = await executeTransition(actor, "c1", { to: "viet_kich_ban" })
    expect(r.to).toBe("viet_kich_ban")
  })

  it("rejects a script submit when script_url is missing (400, no write)", async () => {
    fx.status = "viet_kich_ban"
    fx.scriptUrl = null
    await expect(
      executeTransition(actor, "c1", { to: "cho_duyet_kich_ban" })
    ).rejects.toMatchObject({ status: 400 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a video submit when video_url is blank whitespace (400)", async () => {
    fx.status = "quay_dung"
    fx.videoUrl = "   "
    await expect(
      executeTransition(actor, "c1", { to: "cho_duyet_video" })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("allows a script submit when script_url is present", async () => {
    fx.status = "viet_kich_ban"
    fx.scriptUrl = "https://docs.google.com/document/d/abc"
    const r = await executeTransition(actor, "c1", {
      to: "cho_duyet_kich_ban",
    })
    expect(r).toEqual({
      id: "c1",
      from: "viet_kich_ban",
      to: "cho_duyet_kich_ban",
    })
  })

  it("allows a video submit when video_url is present", async () => {
    fx.status = "quay_dung"
    fx.videoUrl = "https://drive.google.com/file/d/xyz"
    const r = await executeTransition(actor, "c1", { to: "cho_duyet_video" })
    expect(r.to).toBe("cho_duyet_video")
  })
})

describe("executeTransition — approve is manager-only (SPEC §2, §5.3 R3, task 4.4)", () => {
  it("lets a project manager approve a script (cho_duyet_kich_ban → quay_dung)", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.actorRole = "manager"
    const r = await executeTransition(actor, "c1", { to: "quay_dung" })
    expect(r).toEqual({
      id: "c1",
      from: "cho_duyet_kich_ban",
      to: "quay_dung",
    })
  })

  it("lets a project manager approve a video (cho_duyet_video → da_duyet)", async () => {
    fx.status = "cho_duyet_video"
    fx.actorRole = "manager"
    const r = await executeTransition(actor, "c1", { to: "da_duyet" })
    expect(r.to).toBe("da_duyet")
  })

  it("rejects a staff member approving a script (403, no write)", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.actorRole = "staff"
    await expect(
      executeTransition(actor, "c1", { to: "quay_dung" })
    ).rejects.toMatchObject({ status: 403 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a staff member approving a video (403)", async () => {
    fx.status = "cho_duyet_video"
    fx.actorRole = "staff"
    await expect(
      executeTransition(actor, "c1", { to: "da_duyet" })
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe("executeTransition — return is manager-only + reason required (SPEC §5.3 R3, task 4.5)", () => {
  it("lets a project manager return a script with a reason (cho_duyet_kich_ban → viet_kich_ban)", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.actorRole = "manager"
    const r = await executeTransition(actor, "c1", {
      to: "viet_kich_ban",
      reason: "Mở bài chưa rõ thông điệp",
    })
    expect(r).toEqual({
      id: "c1",
      from: "cho_duyet_kich_ban",
      to: "viet_kich_ban",
    })
  })

  it("rejects a manager return with no reason (400, no write)", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.actorRole = "manager"
    await expect(
      executeTransition(actor, "c1", { to: "viet_kich_ban" })
    ).rejects.toMatchObject({ status: 400 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a manager return with a blank reason (400, schema)", async () => {
    fx.status = "cho_duyet_video"
    fx.actorRole = "manager"
    await expect(
      executeTransition(actor, "c1", { to: "quay_dung", reason: "   " })
    ).rejects.toMatchObject({ status: 400 })
  })

  it("rejects a staff member returning a script (403, no write)", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.actorRole = "staff"
    await expect(
      executeTransition(actor, "c1", {
        to: "viet_kich_ban",
        reason: "gửi lại đi",
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(fx.updateSpy).not.toHaveBeenCalled()
  })

  it("rejects a staff member returning a video (403)", async () => {
    fx.status = "cho_duyet_video"
    fx.actorRole = "staff"
    await expect(
      executeTransition(actor, "c1", { to: "quay_dung", reason: "làm lại" })
    ).rejects.toMatchObject({ status: 403 })
  })
})
