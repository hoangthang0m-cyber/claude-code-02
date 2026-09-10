import { authedJson } from "@/lib/api/authedFetch"
import type { AssistantAnswer, AssistantMessage } from "@/lib/domain"

// Máy chủ không lưu hội thoại — mỗi lượt client gửi lại toàn bộ lịch sử.
export function askAssistant(messages: AssistantMessage[]) {
  return authedJson<AssistantAnswer>("/api/assistant", {
    method: "POST",
    body: JSON.stringify({ messages }),
  })
}
