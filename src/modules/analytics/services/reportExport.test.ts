import { describe, expect, it } from "vitest"

import { toCsv } from "@/lib/csv"
import {
  comparisonCsvRows,
  peopleCsvRows,
  reportCsvRows,
} from "@/modules/analytics/services/reportExport"

const period = {
  kind: "month" as const,
  start: 0,
  end: 0,
  start_date: "2026-09-01",
}

const report = (over = {}) => ({
  mode: "manager" as const,
  period,
  has_data: true,
  throughput: 4,
  on_time: 3,
  on_time_rate: 0.75,
  returns: 2,
  total_spend: 500,
  total_messages: 40,
  weighted_roas: 3.5,
  top_by_roas: [
    { content_item_id: "a", code: "A1", roas: 5, spend: 100 },
    { content_item_id: "b", code: "B2", roas: 2, spend: 50 },
  ],
  ...over,
})

describe("reportCsvRows — 'chứa đúng chỉ số đang xem' (task 8.5)", () => {
  it("carries every metric value + the top-by-ROAS section", () => {
    const csv = toCsv(reportCsvRows(report()))
    expect(csv).toContain("Số hạng mục lên ads (throughput),4")
    expect(csv).toContain("Tỷ lệ đúng hạn,0.75")
    expect(csv).toContain("Tổng chi phí ads,500")
    expect(csv).toContain("ROAS trung bình (trọng số chi phí),3.5")
    expect(csv).toContain("Top hạng mục theo ROAS")
    expect(csv).toContain("A1,5,100")
  })

  it("marks an empty period + drops the top section", () => {
    const csv = toCsv(
      reportCsvRows(
        report({ has_data: false, throughput: 0, top_by_roas: [] })
      )
    )
    expect(csv).toContain("Chưa có dữ liệu trong kỳ")
    expect(csv).not.toContain("Top hạng mục theo ROAS")
  })
})

describe("comparisonCsvRows (task 8.4 / 8.5)", () => {
  it("has the six comparison columns and formats % / direction", () => {
    const rows = comparisonCsvRows({
      mode: "manager",
      period,
      previous_period: { ...period, start_date: "2026-08-01" },
      current: report(),
      previous: report({ throughput: 2, returns: 0 }),
      deltas: {
        throughput: { current: 4, previous: 2, abs: 2, pct: 1, direction: "up" },
        on_time: { current: 3, previous: 3, abs: 0, pct: 0, direction: "flat" },
        on_time_rate: { current: 0.75, previous: 1, abs: -0.25, pct: -0.25, direction: "down" },
        returns: { current: 2, previous: 0, abs: 2, pct: null, direction: "up" },
        total_spend: { current: 500, previous: 250, abs: 250, pct: 1, direction: "up" },
        total_messages: { current: 40, previous: 40, abs: 0, pct: 0, direction: "flat" },
        weighted_roas: { current: 3.5, previous: 2, abs: 1.5, pct: 0.75, direction: "up" },
      },
    })
    const csv = toCsv(rows)
    expect(csv).toContain("Chỉ số,Kỳ này,Kỳ trước,Chênh lệch,%,Hướng")
    expect(csv).toContain("Số hạng mục lên ads (throughput),4,2,2,100%,tăng")
    expect(csv).toContain("Số lần trả lại duyệt,2,0,2,—,tăng") // null pct → —
    expect(csv).toContain("2026-09-01 vs 2026-08-01")
  })
})

describe("peopleCsvRows (task 8.2 / 8.5)", () => {
  it("one row per person, lead time in days, — when never approved", () => {
    const csv = toCsv(
      peopleCsvRows({
        mode: "manager",
        period: { from: Date.UTC(2026, 8, 1), to: Date.UTC(2026, 9, 1) },
        people: [
          {
            user_id: "u1",
            name: "An",
            in_progress: 3,
            completed_in_period: 2,
            overdue: 1,
            has_overdue: true,
            avg_lead_time_ms: 3 * 86_400_000,
          },
          {
            user_id: "u2",
            name: "Bình",
            in_progress: 0,
            completed_in_period: 0,
            overdue: 0,
            has_overdue: false,
            avg_lead_time_ms: null,
          },
        ],
      })
    )
    expect(csv).toContain(
      "Nhân sự,Đang thực hiện,Hoàn tất trong kỳ,Quá hạn,Thời gian TB nhận→duyệt (ngày)"
    )
    expect(csv).toContain("An,3,2,1,3")
    expect(csv).toContain("Bình,0,0,0,—")
  })
})
