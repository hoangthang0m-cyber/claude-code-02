import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    disabled: [] as string[], // doc ids `${uid}__${group}` that are OFF
    setSpy: vi.fn(),
  },
}))

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: fx.disabled.includes(id),
          data: () => ({ enabled: false }),
        }),
        set: (v: unknown, opts: unknown) => fx.setSpy(id, v, opts),
      }),
    }),
  }),
}))

import type { AuthedUser } from "@/lib/server/auth"
import {
  listNotificationPreferences,
  setNotificationPreference,
} from "@/modules/notifications/services/notificationPreferences.server"

const me: AuthedUser = { uid: "u1", email: null, system_role: "staff" }

beforeEach(() => {
  fx.disabled = []
  fx.setSpy.mockReset().mockResolvedValue(undefined)
})

describe("listNotificationPreferences (SPEC §5.7 R4, task 7.5)", () => {
  it("lists all six groups, everything on by default (opt-out model)", async () => {
    const { preferences } = await listNotificationPreferences(me)
    expect(preferences.map((p) => p.group)).toEqual([
      "assignment",
      "approval",
      "overdue",
      "ads",
      "comment_mention",
      "sync",
    ])
    expect(preferences.every((p) => p.enabled)).toBe(true)
    expect(preferences.find((p) => p.group === "comment_mention")?.label).toBe(
      "Bình luận / nhắc tên"
    )
  })

  it("reflects a disabled group for this user only", async () => {
    fx.disabled = ["u1__comment_mention"]
    const { preferences } = await listNotificationPreferences(me)
    expect(preferences.find((p) => p.group === "comment_mention")?.enabled).toBe(
      false
    )
    expect(
      preferences.filter((p) => p.group !== "comment_mention").every((p) => p.enabled)
    ).toBe(true)
  })
})

describe("setNotificationPreference", () => {
  it("writes the deterministic per-user row", async () => {
    const r = await setNotificationPreference(me, {
      group: "ads",
      enabled: false,
    })
    expect(r).toEqual({ group: "ads", enabled: false })
    expect(fx.setSpy).toHaveBeenCalledWith(
      "u1__ads",
      { user_id: "u1", group: "ads", enabled: false },
      { merge: true }
    )
  })

  it("rejects an unknown group (400)", async () => {
    await expect(
      setNotificationPreference(me, { group: "spam", enabled: false })
    ).rejects.toMatchObject({ status: 400 })
    expect(fx.setSpy).not.toHaveBeenCalled()
  })

  it("rejects a non-boolean enabled (400)", async () => {
    await expect(
      setNotificationPreference(me, { group: "ads", enabled: "no" })
    ).rejects.toMatchObject({ status: 400 })
  })
})
