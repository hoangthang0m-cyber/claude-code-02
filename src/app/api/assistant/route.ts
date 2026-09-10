import { getAuthedUser } from "@/lib/server/auth"
import { errorResponse } from "@/lib/server/http"
import { readJsonBody } from "@/lib/server/validate"
import { askAssistant } from "@/modules/assistant/services/assistant.server"

export const dynamic = "force-dynamic"

// POST /api/assistant — hỏi trợ lý AI. Chỉ đọc dữ liệu; mọi công cụ nó gọi đều
// chạy dưới danh nghĩa người đăng nhập nên không vượt được quyền sẵn có.
export async function POST(request: Request) {
  try {
    const actor = await getAuthedUser(request)
    const answer = await askAssistant(actor, await readJsonBody(request))
    return Response.json(answer)
  } catch (error) {
    return errorResponse(error)
  }
}
