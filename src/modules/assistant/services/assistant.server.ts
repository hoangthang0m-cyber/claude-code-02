import type Anthropic from "@anthropic-ai/sdk"

import {
  ASSISTANT_MAX_TOOL_ROUNDS,
  assistantAskSchema,
  type AssistantAnswer,
  type AssistantToolCall,
} from "@/lib/domain"
import type { AuthedUser } from "@/lib/server/auth"
import {
  ASSISTANT_FALLBACK_BETA,
  ASSISTANT_MODEL,
  getAnthropic,
  toHttpError,
} from "@/lib/server/anthropic"
import { parseOrThrow } from "@/lib/server/validate"
import {
  ASSISTANT_TOOLS,
  ASSISTANT_TOOL_BY_NAME,
} from "@/modules/assistant/services/assistantTools.server"

// Trợ lý AI — vòng lặp gọi công cụ viết tay. Chỉ đọc dữ liệu; không công cụ nào
// ghi. Dùng vòng lặp tay thay cho tool runner của SDK vì mỗi công cụ phải chạy
// dưới danh nghĩa người đang hỏi, và ta cần chặn cứng số vòng để không đốt tiền.

function systemPrompt(actor: AuthedUser): string {
  const role =
    actor.system_role === "manager"
      ? "Trưởng phòng (manager) — thấy được số liệu quảng cáo và toàn bộ phạm vi quản lý"
      : "Nhân viên (staff) — chỉ thấy dữ liệu của những dự án họ tham gia"

  return [
    "Bạn là trợ lý nội bộ của Hẻm Tarot, một đội làm marketing nội dung.",
    "Ứng dụng theo dõi: Dự án, Hạng mục nội dung (kịch bản/video, có trạng thái và deadline),",
    "Lịch đội, Báo cáo hiệu quả quảng cáo Meta, Tài liệu, và kho Tri thức đúc kết.",
    "",
    `Người đang hỏi có vai trò: ${role}.`,
    "",
    "QUY TẮC:",
    "- Luôn trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc.",
    "- CHỈ dựa vào dữ liệu lấy được từ công cụ. Tuyệt đối không bịa số liệu, tên dự án hay tên người.",
    "- Cần dữ liệu thì gọi công cụ. Cần project_id thì gọi list_my_projects trước.",
    "- Nếu công cụ trả về rỗng, hãy nói thẳng là không có dữ liệu, đừng suy đoán.",
    "- Nếu công cụ báo lỗi quyền, hãy giải thích rằng vai trò hiện tại không xem được mục đó,",
    "  và gợi ý liên hệ Trưởng phòng. Không tìm đường vòng để lấy dữ liệu đó.",
    "- Khi nêu số liệu, ghi rõ nó thuộc dự án nào hoặc phạm vi nào.",
    "- Bạn không thực hiện được thay đổi nào (tạo, sửa, xoá). Nếu được nhờ, hãy chỉ",
    "  người dùng thao tác ở màn hình tương ứng.",
  ].join("\n")
}

const TOOL_DEFS: Anthropic.Beta.BetaTool[] = ASSISTANT_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema as Anthropic.Beta.BetaTool["input_schema"],
}))

function textOf(blocks: Anthropic.Beta.BetaContentBlock[]): string {
  return blocks
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()
}

export async function askAssistant(
  actor: AuthedUser,
  body: unknown
): Promise<AssistantAnswer> {
  const { messages: history } = parseOrThrow(assistantAskSchema, body)
  const client = getAnthropic()

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const toolsUsed: AssistantToolCall[] = []
  let inputTokens = 0
  let outputTokens = 0

  const usage = () => ({
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  })

  try {
    for (let round = 0; round < ASSISTANT_MAX_TOOL_ROUNDS; round++) {
      const reply = await client.beta.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        // Suy luận thích ứng: model tự quyết định nghĩ sâu tới đâu.
        thinking: { type: "adaptive" },
        // Bị từ chối vì chính sách thì Anthropic tự chạy lại trên model dự phòng.
        betas: [ASSISTANT_FALLBACK_BETA],
        fallbacks: "default",
        system: systemPrompt(actor),
        tools: TOOL_DEFS,
        messages,
      })

      inputTokens += reply.usage.input_tokens
      outputTokens += reply.usage.output_tokens

      // Phải kiểm stop_reason TRƯỚC khi đọc content: cả chuỗi model đều từ chối
      // thì content không có câu trả lời nào.
      if (reply.stop_reason === "refusal") {
        return {
          text: "Câu hỏi này tôi không trả lời được. Bạn thử hỏi cách khác nhé.",
          tools_used: toolsUsed,
          usage: usage(),
        }
      }

      const toolUses = reply.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
      )

      if (reply.stop_reason !== "tool_use" || toolUses.length === 0) {
        return {
          text: textOf(reply.content) || "Xin lỗi, tôi chưa trả lời được câu này.",
          tools_used: toolsUsed,
          usage: usage(),
        }
      }

      // Trả nguyên `content` về, không lọc bớt: khối suy luận phải được giữ
      // nguyên vẹn khi nói tiếp cùng một model.
      messages.push({ role: "assistant", content: reply.content })

      // Chạy từng công cụ dưới danh nghĩa người đang hỏi. Lỗi của một công cụ
      // được trả ngược vào hội thoại thay vì làm hỏng cả lượt — model sẽ tự
      // giải thích cho người dùng. Mọi tool_result phải nằm chung MỘT tin nhắn.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
      for (const use of toolUses) {
        const tool = ASSISTANT_TOOL_BY_NAME.get(use.name)
        if (!tool) {
          toolsUsed.push({ name: use.name, ok: false })
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `Không có công cụ tên "${use.name}".`,
          })
          continue
        }

        try {
          const out = await tool.run(
            actor,
            (use.input ?? {}) as Record<string, unknown>
          )
          toolsUsed.push({ name: use.name, ok: true })
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(out),
          })
        } catch (e) {
          toolsUsed.push({ name: use.name, ok: false })
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: e instanceof Error ? e.message : "Không lấy được dữ liệu",
          })
        }
      }

      messages.push({ role: "user", content: results })
    }

    // Hết số vòng cho phép mà model vẫn đòi gọi tiếp — dừng lại thay vì để nó
    // quay vòng vô hạn và đốt tiền.
    return {
      text: "Câu hỏi này cần tra cứu quá nhiều bước. Bạn thử hỏi cụ thể hơn cho một dự án nhé.",
      tools_used: toolsUsed,
      usage: usage(),
    }
  } catch (error) {
    throw toHttpError(error)
  }
}
