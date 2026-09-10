import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk"

import { HttpError } from "@/lib/server/http"

// Khách gọi Anthropic dùng chung cho trợ lý AI. Khoá chỉ tồn tại phía máy chủ —
// KHÔNG bao giờ đặt tiền tố NEXT_PUBLIC_, vì làm thế là đẩy khoá ra trình duyệt
// cho bất kỳ ai đọc được.
//
// Khoá cấp tổ chức (không gắn workspace) bị Anthropic từ chối kèm thông báo đòi
// header `anthropic-workspace-id`. Nên ANTHROPIC_WORKSPACE_ID là tuỳ chọn: đặt
// nó nếu bạn dùng loại khoá đó, bỏ trống nếu khoá đã gắn sẵn workspace.

export const ASSISTANT_MODEL = "claude-opus-5"

// Khi model chính từ chối vì lý do chính sách, máy chủ Anthropic tự chạy lại
// yêu cầu trên model dự phòng ngay trong cùng lệnh gọi. Dạng "default" để
// Anthropic tự chọn model thay thế theo loại từ chối — khỏi phải bảo trì danh
// sách. Header phải khớp đúng dạng đang dùng, ghép lệch sẽ bị 400.
export const ASSISTANT_FALLBACK_BETA = "server-side-fallback-2026-07-01"

let cached: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (cached) return cached

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    throw new HttpError(
      503,
      "Trợ lý AI chưa được cấu hình — thiếu ANTHROPIC_API_KEY trên máy chủ"
    )
  }

  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim()
  cached = new Anthropic({
    apiKey,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  })
  return cached
}

// Đổi lỗi của SDK thành HttpError để route trả về thông báo tiếng Việt dễ hiểu
// thay vì ném nguyên văn lỗi nhà cung cấp ra cho người dùng cuối. Bắt theo
// từng lớp cụ thể chứ không gộp một mẻ, để phân biệt được cái nào thử lại được.
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error

  if (error instanceof AuthenticationError) {
    return new HttpError(
      503,
      "Khoá API của trợ lý không hợp lệ — kiểm tra lại ANTHROPIC_API_KEY"
    )
  }
  if (error instanceof RateLimitError) {
    return new HttpError(
      429,
      "Trợ lý đang quá tải hoặc chạm hạn mức — thử lại sau ít phút"
    )
  }
  if (error instanceof APIConnectionError) {
    return new HttpError(504, "Không kết nối được tới trợ lý — thử lại sau")
  }
  if (error instanceof APIError) {
    const raw = error.message ?? ""
    if (error.status === 400 && raw.includes("workspace")) {
      return new HttpError(
        503,
        "Khoá API chưa gắn workspace — thêm ANTHROPIC_WORKSPACE_ID vào máy chủ, hoặc tạo khoá gắn sẵn workspace"
      )
    }
    if (error.status === 400 && /credit|billing/i.test(raw)) {
      return new HttpError(
        503,
        "Tài khoản Anthropic hết số dư — nạp thêm để tiếp tục dùng trợ lý"
      )
    }
    return new HttpError(502, "Trợ lý gặp sự cố khi trả lời — thử lại sau")
  }

  return new HttpError(502, "Trợ lý gặp sự cố khi trả lời — thử lại sau")
}
