import { AssistantChat } from "@/modules/assistant/components/AssistantChat"

// Trợ lý AI — chỉ đọc dữ liệu, tôn trọng đúng phân quyền của người đang hỏi.
export default function AssistantPage() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 px-4 py-4 duration-300 md:px-6 md:py-6">
      <AssistantChat />
    </div>
  )
}
