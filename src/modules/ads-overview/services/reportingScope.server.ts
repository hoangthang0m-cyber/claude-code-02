import { requireSystemManager } from "@/lib/permissions/projectScope"
import type { AuthedUser } from "@/lib/server/auth"

// ads-overview-reporting change, group 1 task 1.8. The single gate for every
// reporting + product-config endpoint: only a `system_role = manager` account
// may read the Báo cáo page or edit product rules (spec "Chỉ Trưởng phòng truy
// cập trang Báo cáo và cấu hình sản phẩm"). Enforced server-side, not just in
// the UI.
export function requireReportingManager(actor: AuthedUser): void {
  requireSystemManager(
    actor,
    "Chỉ Trưởng phòng được xem báo cáo hiệu quả quảng cáo"
  )
}
