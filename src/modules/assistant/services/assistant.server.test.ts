import { beforeEach, describe, expect, it, vi } from "vitest"

// Trợ lý AI — vòng lặp gọi công cụ. Dùng client Anthropic giả nên test không
// gọi mạng và không tốn tiền.

const { fx, create, toolRun } = vi.hoisted(() => ({
  fx: { replies: [] as unknown[] },
  create: vi.fn(),
  toolRun: vi.fn(),
}))

vi.mock("@/lib/server/anthropic", () => ({
  ASSISTANT_MODEL: "claude-opus-5",
  ASSISTANT_FALLBACK_BETA: "server-side-fallback-2026-07-01",
  getAnthropic: () => ({ beta: { messages: { create } } }),
  toHttpError: (e: unknown) => e,
}))

vi.mock("@/modules/assistant/services/assistantTools.server", () => {
  const tool = {
    name: "list_my_projects",
    description: "d",
    input_schema: { type: "object", properties: {} },
    run: toolRun,
  }
  return {
    ASSISTANT_TOOLS: [tool],
    ASSISTANT_TOOL_BY_NAME: new Map([[tool.name, tool]]),
  }
})

import type { AuthedUser } from "@/lib/server/auth"
import { askAssistant } from "@/modules/assistant/services/assistant.server"

const staff: AuthedUser = { uid: "u1", email: null, system_role: "staff" }
const ask = (q = "dự án của tôi?") => ({ messages: [{ role: "user", content: q }] })

const usage = { input_tokens: 10, output_tokens: 5 }
const say = (text: string) => ({
  stop_reason: "end_turn",
  usage,
  content: [{ type: "text", text }],
})
const callTool = (name: string, input: Record<string, unknown> = {}) => ({
  stop_reason: "tool_use",
  usage,
  content: [{ type: "tool_use", id: "tu1", name, input }],
})

beforeEach(() => {
  fx.replies = []
  create.mockReset()
  toolRun.mockReset()
  // mỗi lần gọi trả về phần tử kế tiếp trong hàng đợi
  create.mockImplementation(async () => fx.replies.shift())
})

describe("askAssistant", () => {
  it("trả lời thẳng khi model không cần công cụ", async () => {
    fx.replies = [say("Chào bạn")]
    const r = await askAssistant(staff, ask())
    expect(r.text).toBe("Chào bạn")
    expect(r.tools_used).toEqual([])
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 5 })
  })

  it("gọi công cụ rồi tổng hợp câu trả lời, và cộng dồn token cả hai vòng", async () => {
    toolRun.mockResolvedValue({ projects: [{ name: "UGC" }] })
    fx.replies = [callTool("list_my_projects"), say("Bạn có 1 dự án: UGC")]

    const r = await askAssistant(staff, ask())

    expect(r.text).toBe("Bạn có 1 dự án: UGC")
    expect(r.tools_used).toEqual([{ name: "list_my_projects", ok: true }])
    expect(r.usage).toEqual({ input_tokens: 20, output_tokens: 10 })
  })

  it("chạy công cụ dưới danh nghĩa người đang hỏi", async () => {
    toolRun.mockResolvedValue({ projects: [] })
    fx.replies = [callTool("list_my_projects"), say("xong")]

    await askAssistant(staff, ask())

    expect(toolRun).toHaveBeenCalledWith(staff, {})
  })

  it("mọi tool_result nằm chung một tin nhắn user, và khối assistant được giữ nguyên", async () => {
    toolRun.mockResolvedValue({ ok: 1 })
    fx.replies = [callTool("list_my_projects"), say("xong")]

    await askAssistant(staff, ask())

    const second = create.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>
    }
    // [câu hỏi, lượt assistant, một tin nhắn chứa toàn bộ tool_result]
    expect(second.messages).toHaveLength(3)
    expect(second.messages[1].role).toBe("assistant")
    const results = second.messages[2].content as Array<{ type: string }>
    expect(second.messages[2].role).toBe("user")
    expect(results).toHaveLength(1)
    expect(results[0].type).toBe("tool_result")
  })

  it("công cụ lỗi quyền thì trả lỗi ngược vào hội thoại, không làm hỏng cả lượt", async () => {
    toolRun.mockRejectedValue(new Error("Bạn không có quyền với dự án này"))
    fx.replies = [callTool("list_my_projects"), say("Bạn không xem được mục này")]

    const r = await askAssistant(staff, ask())

    expect(r.tools_used).toEqual([{ name: "list_my_projects", ok: false }])
    const second = create.mock.calls[1][0] as {
      messages: Array<{ content: unknown }>
    }
    const results = second.messages[2].content as Array<{
      is_error?: boolean
      content: string
    }>
    expect(results[0].is_error).toBe(true)
    expect(results[0].content).toContain("không có quyền")
    expect(r.text).toBe("Bạn không xem được mục này")
  })

  it("model gọi công cụ không tồn tại thì báo lỗi chứ không ném", async () => {
    fx.replies = [callTool("khong_co_that"), say("xin lỗi")]
    const r = await askAssistant(staff, ask())
    expect(r.tools_used).toEqual([{ name: "khong_co_that", ok: false }])
    expect(toolRun).not.toHaveBeenCalled()
  })

  it("bị từ chối vì chính sách thì trả thông báo thân thiện", async () => {
    fx.replies = [{ stop_reason: "refusal", usage, content: [] }]
    const r = await askAssistant(staff, ask())
    expect(r.text).toContain("không trả lời được")
  })

  it("chặn vòng lặp vô hạn khi model cứ đòi gọi công cụ mãi", async () => {
    toolRun.mockResolvedValue({})
    create.mockImplementation(async () => callTool("list_my_projects"))

    const r = await askAssistant(staff, ask())

    expect(r.text).toContain("quá nhiều bước")
    expect(create).toHaveBeenCalledTimes(6)
  })

  it("từ chối lịch sử rỗng hoặc kết thúc bằng lượt assistant", async () => {
    await expect(askAssistant(staff, { messages: [] })).rejects.toBeTruthy()
    await expect(
      askAssistant(staff, { messages: [{ role: "assistant", content: "hi" }] })
    ).rejects.toBeTruthy()
  })

  it("gửi đúng model, bật suy luận thích ứng và dự phòng khi bị từ chối", async () => {
    fx.replies = [say("ok")]
    await askAssistant(staff, ask())

    const req = create.mock.calls[0][0] as Record<string, unknown>
    expect(req.model).toBe("claude-opus-5")
    expect(req.thinking).toEqual({ type: "adaptive" })
    expect(req.fallbacks).toBe("default")
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"])
    expect(String(req.system)).toContain("Nhân viên (staff)")
  })

  it("nói cho model biết người hỏi là trưởng phòng", async () => {
    fx.replies = [say("ok")]
    await askAssistant(
      { uid: "u2", email: null, system_role: "manager" },
      ask()
    )
    expect(String((create.mock.calls[0][0] as Record<string, unknown>).system)).toContain(
      "Trưởng phòng (manager)"
    )
  })
})
