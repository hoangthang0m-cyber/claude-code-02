import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({}),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import {
  requireReportingManager,
  requireReportingViewer,
} from "@/modules/ads-overview/services/reportingScope.server"

const manager: AuthedUser = { uid: "u1", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "u2", email: null, system_role: "staff" }

// Quyền xem báo cáo và quyền sửa cấu hình đã tách đôi (2026-09-28): mọi thành
// viên xem được hiệu quả quảng cáo, chỉ Trưởng phòng sửa được cấu hình.
describe("requireReportingViewer — xem báo cáo", () => {
  it("cho Trưởng phòng đi qua", () => {
    expect(() => requireReportingViewer(manager)).not.toThrow()
  })

  it("cho nhân viên đi qua — đây là thay đổi so với trước", () => {
    expect(() => requireReportingViewer(staff)).not.toThrow()
  })
})

describe("requireReportingManager — sửa cấu hình", () => {
  it("cho Trưởng phòng đi qua", () => {
    expect(() => requireReportingManager(manager)).not.toThrow()
  })

  it("vẫn chặn nhân viên bằng 403", () => {
    expect(() => requireReportingManager(staff)).toThrowError(
      expect.objectContaining({ status: 403 })
    )
  })
})
