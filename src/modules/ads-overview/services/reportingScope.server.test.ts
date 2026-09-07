import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminDb: () => ({}),
  getAdminAuth: () => ({}),
}))

import type { AuthedUser } from "@/lib/server/auth"
import { requireReportingManager } from "@/modules/ads-overview/services/reportingScope.server"

const manager: AuthedUser = { uid: "u1", email: null, system_role: "manager" }
const staff: AuthedUser = { uid: "u2", email: null, system_role: "staff" }

// ads-overview-reporting change, task 1.8: the Báo cáo page + product config are
// manager-only, enforced server-side.
describe("requireReportingManager (task 1.8)", () => {
  it("passes a system_role = manager", () => {
    expect(() => requireReportingManager(manager)).not.toThrow()
  })

  it("rejects a staff account with 403", () => {
    expect(() => requireReportingManager(staff)).toThrowError(
      expect.objectContaining({ status: 403 })
    )
  })
})
