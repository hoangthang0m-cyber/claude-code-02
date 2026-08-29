import { beforeEach, describe, expect, it, vi } from "vitest"

const { fx } = vi.hoisted(() => ({
  fx: {
    managers: ["mgr-a", "mgr-b"] as string[],
    /** doc ids (`${uid}__${group}`) that are turned OFF */
    disabled: [] as string[],
    queueSpy: vi.fn(),
  },
}))

vi.mock("@/modules/notifications/services/notify.server", () => ({
  projectManagerUids: vi.fn(async () => fx.managers),
  queueNotification: (
    _db: unknown,
    _batch: unknown,
    input: Record<string, unknown>
  ) => fx.queueSpy(input),
}))

import {
  emitNotifications,
  notificationMessage,
  notificationRecipients,
  type NotificationEvent,
} from "@/modules/notifications/services/notificationEngine.server"

// minimal Firestore stub — only notificationPreferences reads matter here
const db = {
  collection: () => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: fx.disabled.includes(id),
        data: () => ({ enabled: false }),
      }),
    }),
  }),
} as never
const batch = {} as never

const base = {
  project_id: "p1",
  content_item_id: "ci1",
  code: "V001",
}

beforeEach(() => {
  fx.managers = ["mgr-a", "mgr-b"]
  fx.disabled = []
  fx.queueSpy.mockReset()
})

async function recipients(event: NotificationEvent): Promise<string[]> {
  return [...(await notificationRecipients(db, event))].sort()
}

describe("notificationRecipients — SPEC §5.7 R1 event → recipient table", () => {
  it("content_assigned → the assignee", async () => {
    expect(
      await recipients({ ...base, type: "content_assigned", actor_id: "mgr-a", assignee_id: "u2" })
    ).toEqual(["u2"])
  })

  it("review_requested → the project managers", async () => {
    expect(
      await recipients({
        ...base,
        type: "review_requested",
        actor_id: "u2",
        to_status: "cho_duyet_video",
      })
    ).toEqual(["mgr-a", "mgr-b"])
  })

  it("review_approved / review_returned → the assignee", async () => {
    expect(
      await recipients({ ...base, type: "review_approved", actor_id: "mgr-a", assignee_id: "u2" })
    ).toEqual(["u2"])
    expect(
      await recipients({
        ...base,
        type: "review_returned",
        actor_id: "mgr-a",
        assignee_id: "u2",
        reason: "x",
      })
    ).toEqual(["u2"])
  })

  it("content_overdue → the assignee + the project managers", async () => {
    expect(
      await recipients({ ...base, type: "content_overdue", actor_id: null, assignee_id: "u2" })
    ).toEqual(["mgr-a", "mgr-b", "u2"])
  })

  it("ads_stopped → the project managers", async () => {
    expect(
      await recipients({
        ...base,
        type: "ads_stopped",
        actor_id: null,
        delivery_status: "paused",
      })
    ).toEqual(["mgr-a", "mgr-b"])
  })

  it("comment_added → assignee + managers, minus anyone already told", async () => {
    expect(
      await recipients({
        ...base,
        type: "comment_added",
        actor_id: "u9",
        assignee_id: "u2",
        also_notified: ["mgr-b"],
      })
    ).toEqual(["mgr-a", "u2"])
  })

  it("comment_mention → exactly the people named", async () => {
    expect(
      await recipients({
        ...base,
        type: "comment_mention",
        actor_id: "u9",
        mentioned_ids: ["u2", "u3"],
      })
    ).toEqual(["u2", "u3"])
  })

  it("sync_issue → the project managers", async () => {
    expect(
      await recipients({
        project_id: "p1",
        type: "sync_issue",
        actor_id: null,
        message: "lỗi",
      })
    ).toEqual(["mgr-a", "mgr-b"])
  })
})

describe("emitNotifications — never notify the person who caused it", () => {
  it("drops the actor from the recipient set", async () => {
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "content_overdue",
      actor_id: "mgr-a",
      assignee_id: "u2",
    })
    expect(recipients.sort()).toEqual(["mgr-b", "u2"])
    expect(fx.queueSpy).toHaveBeenCalledTimes(2)
  })

  it("a self-claim notifies nobody (actor === only recipient)", async () => {
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "content_assigned",
      actor_id: "u2",
      assignee_id: "u2",
    })
    expect(recipients).toEqual([])
    expect(fx.queueSpy).not.toHaveBeenCalled()
  })

  it("a manager approving their own item notifies nobody", async () => {
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "review_approved",
      actor_id: "mgr-a",
      assignee_id: "mgr-a",
    })
    expect(recipients).toEqual([])
  })

  it("writes one Notification per recipient with the item link + type", async () => {
    await emitNotifications(db, batch, {
      ...base,
      type: "review_requested",
      actor_id: "u2",
      to_status: "cho_duyet_kich_ban",
    })
    expect(fx.queueSpy.mock.calls.map((c) => c[0])).toEqual([
      {
        recipient_id: "mgr-a",
        type: "review_requested",
        content_item_id: "ci1",
        project_id: "p1",
        message: "Hạng mục V001 đang chờ duyệt kịch bản",
      },
      {
        recipient_id: "mgr-b",
        type: "review_requested",
        content_item_id: "ci1",
        project_id: "p1",
        message: "Hạng mục V001 đang chờ duyệt kịch bản",
      },
    ])
  })

  it("no managers → no notification, no throw", async () => {
    fx.managers = []
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "ads_stopped",
      actor_id: null,
      delivery_status: "completed",
    })
    expect(recipients).toEqual([])
  })
})

describe("emitNotifications — SPEC §5.7 R4 group opt-out (task 7.5)", () => {
  it("drops a recipient who turned this event's group off", async () => {
    fx.disabled = ["mgr-a__approval"] // review_* belongs to the 'approval' group
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "review_requested",
      actor_id: "u2",
      to_status: "cho_duyet_kich_ban",
    })
    expect(recipients).toEqual(["mgr-b"])
    expect(fx.queueSpy).toHaveBeenCalledTimes(1)
  })

  it("a different group for the same user is unaffected", async () => {
    fx.disabled = ["mgr-a__approval"]
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "ads_stopped",
      actor_id: null,
      delivery_status: "paused",
    })
    expect(recipients.sort()).toEqual(["mgr-a", "mgr-b"])
  })

  it("everyone in the group muted → notifies nobody", async () => {
    fx.disabled = ["mgr-a__approval", "mgr-b__approval"]
    const { recipients } = await emitNotifications(db, batch, {
      ...base,
      type: "review_requested",
      actor_id: "u2",
      to_status: "cho_duyet_video",
    })
    expect(recipients).toEqual([])
    expect(fx.queueSpy).not.toHaveBeenCalled()
  })
})

describe("notificationMessage", () => {
  it("templates each item event from the code", () => {
    expect(
      notificationMessage({ ...base, type: "content_assigned", actor_id: "x", assignee_id: "u2" })
    ).toBe("Bạn được giao hạng mục V001")
    expect(
      notificationMessage({ ...base, type: "review_returned", actor_id: "x", assignee_id: "u2", reason: "thiếu hook" })
    ).toBe("Hạng mục V001 bị trả lại: thiếu hook")
    expect(
      notificationMessage({ ...base, type: "review_returned", actor_id: "x", assignee_id: "u2" })
    ).toBe("Hạng mục V001 bị trả lại")
    expect(
      notificationMessage({ ...base, type: "ads_stopped", actor_id: null, delivery_status: "completed" })
    ).toBe("Ads của hạng mục V001 đã hoàn tất")
  })

  it("passes a sync_issue message through unchanged", () => {
    expect(
      notificationMessage({
        project_id: "p1",
        type: "sync_issue",
        actor_id: null,
        message: "Mất quyền truy cập Google Sheet",
      })
    ).toBe("Mất quyền truy cập Google Sheet")
  })
})
