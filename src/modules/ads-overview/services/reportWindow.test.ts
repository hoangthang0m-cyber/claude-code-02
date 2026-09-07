import { describe, expect, it } from "vitest"

import { resolveReportWindow } from "@/modules/ads-overview/services/reportWindow"

const q = (s: string) => new URLSearchParams(s)

describe("resolveReportWindow", () => {
  it("resolves a month to its first and last calendar day", () => {
    const w = resolveReportWindow(q("period=month&date=2026-06-15"))
    expect(w.from).toBe("2026-06-01")
    expect(w.to).toBe("2026-06-30")
  })

  it("resolves a week to Monday..Sunday (ISO, Asia/Ho_Chi_Minh)", () => {
    // 2026-06-15 is a Monday
    const w = resolveReportWindow(q("period=week&date=2026-06-17"))
    expect(w.from).toBe("2026-06-15")
    expect(w.to).toBe("2026-06-21")
  })

  it("passes an explicit from/to range through", () => {
    const w = resolveReportWindow(q("from=2026-01-01&to=2026-03-31"))
    expect(w).toMatchObject({ from: "2026-01-01", to: "2026-03-31" })
  })

  it("rejects an unknown period", () => {
    expect(() => resolveReportWindow(q("period=quarter&date=2026-06-15"))).toThrow(
      /week.*month/
    )
  })

  it("rejects from > to", () => {
    expect(() =>
      resolveReportWindow(q("from=2026-05-01&to=2026-01-01"))
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it("rejects a half-open from/to", () => {
    expect(() =>
      resolveReportWindow(q("from=2026-05-01"))
    ).toThrowError(expect.objectContaining({ status: 400 }))
  })

  it("rejects a missing date with a period", () => {
    expect(() => resolveReportWindow(q("period=month"))).toThrowError(
      expect.objectContaining({ status: 400 })
    )
  })

  it("rejects an empty query", () => {
    expect(() => resolveReportWindow(q(""))).toThrowError(
      expect.objectContaining({ status: 400 })
    )
  })
})
