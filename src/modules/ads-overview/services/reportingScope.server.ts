import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"
import { HttpError } from "@/lib/server/http"

// ads-overview-reporting change, group 1 task 1.8 — nay tách làm hai cửa.
//
// Ban đầu cả trang Báo cáo lẫn cấu hình sản phẩm đều chỉ Trưởng phòng
// ("Chỉ Trưởng phòng truy cập trang Báo cáo và cấu hình sản phẩm"). Người dùng
// yêu cầu mở phần XEM hiệu quả quảng cáo cho mọi thành viên (2026-09-28), nên
// quyền đọc báo cáo và quyền sửa cấu hình không còn đi chung nữa.

/**
 * Xem báo cáo hiệu quả quảng cáo: mọi tài khoản đã đăng nhập.
 *
 * Không kiểm gì thêm — route handler đã gọi `getAuthedUser` và trả 401 nếu
 * chưa đăng nhập, nên tới được đây nghĩa là đã xác thực. Giữ hàm này thay vì
 * bỏ trống chỗ gọi để ý định nằm rõ trong code, và để sau này muốn siết lại
 * (ví dụ chỉ thành viên của ít nhất một dự án) thì chỉ sửa một nơi.
 */
export function requireReportingViewer(actor: AuthedUser): void {
  // Route handler đã xác thực rồi; đây là lưới an toàn phòng khi có nơi gọi
  // thẳng service mà quên lấy actor từ token.
  if (!actor?.uid) {
    throw new HttpError(401, "Chưa đăng nhập")
  }
}

/**
 * Sửa cấu hình sản phẩm / tỷ giá / quy tắc tài khoản: vẫn chỉ Trưởng phòng.
 * Đây là thứ định hình lại cách mọi người đọc số liệu, nên không mở kèm.
 */
export function requireReportingManager(actor: AuthedUser): void {
  requireSystemManager(
    actor,
    "Chỉ Trưởng phòng được sửa cấu hình báo cáo"
  )
}
