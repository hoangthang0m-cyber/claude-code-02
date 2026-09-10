"use client"

import * as React from "react"
import { SendIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ASSISTANT_MAX_HISTORY,
  ASSISTANT_MAX_MESSAGE_CHARS,
  type AssistantMessage,
} from "@/lib/domain"
import { useAuth } from "@/context/AuthContext"
import { askAssistant } from "@/modules/assistant/services/assistant.client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/utils/cn"

const SUGGESTIONS = [
  "Tôi đang tham gia những dự án nào?",
  "Hạng mục nào của tôi đang quá hạn?",
  "Tóm tắt tiến độ nội dung hiện tại",
  "Kho tri thức có gì về cách viết content ra đơn?",
]

export function AssistantChat() {
  const { profile, loading } = useAuth()
  const [messages, setMessages] = React.useState<AssistantMessage[]>([])
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, busy])

  async function send(text: string) {
    const question = text.trim()
    if (!question || busy) return
    if (question.length > ASSISTANT_MAX_MESSAGE_CHARS) {
      toast.error(`Câu hỏi tối đa ${ASSISTANT_MAX_MESSAGE_CHARS} ký tự`)
      return
    }

    // Giữ lịch sử trong giới hạn máy chủ chấp nhận: bỏ bớt các lượt cũ nhất.
    const next: AssistantMessage[] = [
      ...messages,
      { role: "user" as const, content: question },
    ].slice(-ASSISTANT_MAX_HISTORY)

    setMessages(next)
    setDraft("")
    setBusy(true)
    try {
      const answer = await askAssistant(next)
      setMessages((prev) =>
        [...prev, { role: "assistant" as const, content: answer.text }].slice(
          -ASSISTANT_MAX_HISTORY
        )
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trợ lý không trả lời được")
      // bỏ lại câu hỏi vào ô soạn để người dùng không phải gõ lại
      setMessages((prev) => prev.slice(0, -1))
      setDraft(question)
    } finally {
      setBusy(false)
    }
  }

  // Chặn phía giao diện cho gọn mắt; máy chủ vẫn trả 403 nếu ai đó gọi thẳng API.
  if (!loading && profile?.system_role !== "manager") {
    return (
      <div className="flex flex-col items-start gap-2 rounded-xl border bg-muted/40 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SparklesIcon className="size-4" />
          Trợ lý Hẻm Tarot
        </div>
        <p className="text-sm text-muted-foreground">
          Mục này chỉ dành cho Trưởng phòng. Nếu bạn cần dùng, hãy liên hệ
          Trưởng phòng để được cấp quyền.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col gap-4">
      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-start gap-3 rounded-xl border bg-muted/40 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SparklesIcon className="size-4" />
              Trợ lý Hẻm Tarot
            </div>
            <p className="text-sm text-muted-foreground">
              Hỏi về dự án, hạng mục nội dung, tiến độ, tài liệu và kho tri thức.
              Trợ lý chỉ đọc dữ liệu bạn có quyền xem, và không tự sửa gì.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => send(s)}
                  disabled={busy}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border bg-card px-3 py-2 text-sm text-muted-foreground">
              Đang tra cứu…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <Textarea
          className="min-h-11 flex-1"
          placeholder="Hỏi trợ lý… (Enter để gửi, Shift+Enter xuống dòng)"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          <SendIcon />
          Gửi
        </Button>
      </form>
    </div>
  )
}
