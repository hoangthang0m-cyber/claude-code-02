import { z } from "zod"

// Trợ lý AI — chỉ đọc dữ liệu, không sửa. Ngoài phạm vi docs/SPEC.md, bổ sung
// theo yêu cầu người dùng (2026-09-10).

export const ASSISTANT_ROLES = ["user", "assistant"] as const
export type AssistantRole = (typeof ASSISTANT_ROLES)[number]

/** Giới hạn để một câu hỏi không thể đốt tiền không kiểm soát. */
export const ASSISTANT_MAX_MESSAGE_CHARS = 4000
export const ASSISTANT_MAX_HISTORY = 20
/** Số vòng gọi công cụ tối đa trong một lượt trả lời. */
export const ASSISTANT_MAX_TOOL_ROUNDS = 6

export const assistantMessageSchema = z.object({
  role: z.enum(ASSISTANT_ROLES),
  content: z.string().trim().min(1).max(ASSISTANT_MAX_MESSAGE_CHARS),
})

export type AssistantMessage = z.infer<typeof assistantMessageSchema>

// Lịch sử do client gửi lên: máy chủ không lưu hội thoại, mỗi lượt gửi lại
// toàn bộ ngữ cảnh. Đơn giản, không thêm collection nào, và người dùng đóng tab
// là hội thoại biến mất — hợp với việc đây chỉ là trợ lý tra cứu.
export const assistantAskSchema = z.object({
  messages: z
    .array(assistantMessageSchema)
    .min(1)
    .max(ASSISTANT_MAX_HISTORY)
    // lượt cuối luôn phải là câu hỏi của người dùng
    .refine((m) => m[m.length - 1]?.role === "user", {
      message: "Tin nhắn cuối phải là câu hỏi của người dùng",
    }),
})

export type AssistantAsk = z.infer<typeof assistantAskSchema>

export interface AssistantToolCall {
  name: string
  ok: boolean
}

export interface AssistantAnswer {
  /** Câu trả lời dạng văn bản thuần. */
  text: string
  /** Các công cụ trợ lý đã gọi — hiện ra cho người dùng biết nó tra ở đâu. */
  tools_used: AssistantToolCall[]
  usage: { input_tokens: number; output_tokens: number }
}
