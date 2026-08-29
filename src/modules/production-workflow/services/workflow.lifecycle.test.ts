import { beforeEach, describe, expect, it, vi } from "vitest"

import { CONTENT_STATUSES, type ContentStatus } from "@/lib/domain"

// SPEC §5.3, task 9.2: drive a content item through the WHOLE production state
// machine — both review steps (kịch bản + video) and both return paths — via
// executeTransition, so the status actually advances and StatusHistory
// accumulates. The pure machine is covered by stateMachine.test.ts; the
// per-transition gates by workflow.transition.test.ts. This is the end-to-end
// sequence + the "every invalid jump is rejected at each state" sweep.

const { fx } = vi.hoisted(() => ({
  fx: {
    role: "staff" as "staff" | "manager",
    status: "chua_bat_dau" as ContentStatus,
    assignee: "u-staff" as string | null,
    scriptUrl: null as string | null,
    videoUrl: null as string | null,
    hasBinding: false,
    history: [] as Array<Record<string, unknown>>,
    commitSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => {
  const query = (name: string, clauses: string[]) => ({
    where: (f: string) => query(name, [...clauses, f]),
    limit: () => query(name, clauses),
    get: async () => {
      // requireProjectScope: the caller's membership row. The uid decides the
      // role (u-staff → staff, u-mgr → manager).
      if (name === "projectMembers" && clauses.includes("user_id")) {
        return {
          empty: false,
          docs: [{ data: () => ({ project_role: fx.role }) }],
        }
      }
      if (name === "projectMembers" && clauses.includes("project_role")) {
        return { docs: [{ data: () => ({ user_id: "u-mgr" }) }] }
      }
      if (name === "adsBindings") {
        return fx.hasBinding
          ? { empty: false, docs: [{ id: "b1" }] }
          : { empty: true, docs: [] }
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
          get: async () =>
            name === "contentItems"
              ? {
                  exists: true,
                  data: () => ({
                    project_id: "p1",
                    code: "V1",
                    status: fx.status,
                    assignee_id: fx.assignee,
                    script_url: fx.scriptUrl,
                    video_url: fx.videoUrl,
                  }),
                }
              : { exists: true, data: () => ({ lifecycle: "running" }) },
          update: (patch: Record<string, unknown>) => {
            if (typeof patch.status === "string") {
              fx.status = patch.status as ContentStatus
            }
          },
        }),
      }),
      batch: () => ({
        update: (_ref: unknown, patch: Record<string, unknown>) => {
          if (typeof patch.status === "string") {
            fx.status = patch.status as ContentStatus
          }
        },
        set: (_ref: unknown, data: Record<string, unknown>) => {
          if (data.from_status) fx.history.push(data)
        },
        commit: fx.commitSpy,
      }),
    }),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { executeTransition } from "@/modules/production-workflow/services/workflow.server"

const staff: AuthedUser = { uid: "u-staff", email: null, system_role: "staff" }
const mgr: AuthedUser = { uid: "u-mgr", email: null, system_role: "manager" }

// executeTransition resolves the role from the membership row; drive it here.
async function asStaff(to: ContentStatus, extra: Record<string, unknown> = {}) {
  fx.role = "staff"
  return executeTransition(staff, "c1", { to, ...extra })
}
async function asManager(to: ContentStatus, extra: Record<string, unknown> = {}) {
  fx.role = "manager"
  return executeTransition(mgr, "c1", { to, ...extra })
}

beforeEach(() => {
  fx.role = "staff"
  fx.status = "chua_bat_dau"
  fx.assignee = "u-staff"
  fx.scriptUrl = null
  fx.videoUrl = null
  fx.hasBinding = false
  fx.history = []
  fx.commitSpy.mockReset().mockResolvedValue(undefined)
})

describe("full production lifecycle (SPEC §5.3, task 9.2)", () => {
  it("walks chua_bat_dau → da_len_ads through both review steps", async () => {
    await asStaff("viet_kich_ban")
    expect(fx.status).toBe("viet_kich_ban")

    fx.scriptUrl = "https://docs.google.com/document/d/s"
    await asStaff("cho_duyet_kich_ban")
    expect(fx.status).toBe("cho_duyet_kich_ban")

    await asManager("quay_dung") // approve script
    expect(fx.status).toBe("quay_dung")

    fx.videoUrl = "https://drive.google.com/file/d/v"
    await asStaff("cho_duyet_video")
    expect(fx.status).toBe("cho_duyet_video")

    await asManager("da_duyet") // approve video
    expect(fx.status).toBe("da_duyet")

    fx.hasBinding = true
    await asManager("da_len_ads") // publish (path A)
    expect(fx.status).toBe("da_len_ads")

    // one StatusHistory row per applied transition
    expect(fx.history.map((h) => h.to_status)).toEqual([
      "viet_kich_ban",
      "cho_duyet_kich_ban",
      "quay_dung",
      "cho_duyet_video",
      "da_duyet",
      "da_len_ads",
    ])
  })

  it("script returned → fixed → re-submitted → approved", async () => {
    fx.status = "cho_duyet_kich_ban"
    fx.scriptUrl = "https://docs.google.com/document/d/s"

    await asManager("viet_kich_ban", { reason: "Mở bài chưa rõ thông điệp" })
    expect(fx.status).toBe("viet_kich_ban")
    expect(fx.history.at(-1)).toMatchObject({
      to_status: "viet_kich_ban",
      reason: "Mở bài chưa rõ thông điệp",
    })

    await asStaff("cho_duyet_kich_ban")
    await asManager("quay_dung")
    expect(fx.status).toBe("quay_dung")
  })

  it("video returned → back to quay_dung with a reason", async () => {
    fx.status = "cho_duyet_video"
    fx.videoUrl = "https://drive.google.com/file/d/v"

    await asManager("quay_dung", { reason: "Âm thanh chưa đạt" })
    expect(fx.status).toBe("quay_dung")
    expect(fx.history.at(-1)).toMatchObject({
      from_status: "cho_duyet_video",
      to_status: "quay_dung",
      reason: "Âm thanh chưa đạt",
    })
  })

  it("publish path B: no binding but the manager confirms", async () => {
    fx.status = "da_duyet"
    fx.hasBinding = false
    const r = await asManager("da_len_ads", { confirm: true })
    expect(r).toMatchObject({ to: "da_len_ads", reminder: "attach_campaign" })
    expect(fx.status).toBe("da_len_ads")
  })

  it("rejects every non-legal jump from every state (409, status unchanged)", async () => {
    const LEGAL = new Set([
      "chua_bat_dau>viet_kich_ban",
      "viet_kich_ban>cho_duyet_kich_ban",
      "cho_duyet_kich_ban>quay_dung",
      "cho_duyet_kich_ban>viet_kich_ban",
      "quay_dung>cho_duyet_video",
      "cho_duyet_video>da_duyet",
      "cho_duyet_video>quay_dung",
      "da_duyet>da_len_ads",
    ])

    for (const from of CONTENT_STATUSES) {
      for (const to of CONTENT_STATUSES) {
        if (LEGAL.has(`${from}>${to}`)) continue
        fx.status = from
        fx.scriptUrl = "https://x"
        fx.videoUrl = "https://x"
        fx.hasBinding = true
        await expect(
          asManager(to, { reason: "r", confirm: true }),
          `${from} → ${to}`
        ).rejects.toMatchObject({ status: 409 })
        expect(fx.status, `${from} → ${to} left status alone`).toBe(from)
      }
    }
  })
})
