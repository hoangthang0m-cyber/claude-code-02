import type { CsvCell } from "@/lib/csv"
import type { ComparedMetric } from "@/lib/domain"

import type {
  PeriodComparisonResult,
  PeriodReportResult,
} from "@/modules/analytics/services/report.server"
import type { PeoplePerformanceResult } from "@/modules/analytics/services/people.server"

// SPEC §5.6 R5, task 8.5: shape the metrics currently on screen into CSV rows.
// Pure — the routes wrap the output with `toCsv` + a download response.

const KIND_LABEL = { week: "Tuần", month: "Tháng" } as const

const METRIC_LABEL: Record<ComparedMetric, string> = {
  throughput: "Số hạng mục lên ads (throughput)",
  on_time: "Đúng hạn",
  on_time_rate: "Tỷ lệ đúng hạn",
  returns: "Số lần trả lại duyệt",
  total_spend: "Tổng chi phí ads",
  total_messages: "Tổng messages",
  weighted_roas: "ROAS trung bình (trọng số chi phí)",
}
const METRIC_ORDER = Object.keys(METRIC_LABEL) as ComparedMetric[]

const DIRECTION_LABEL = { up: "tăng", down: "giảm", flat: "không đổi" } as const

function round(n: number, dp = 4): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function localDate(ms: number): string {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function days(ms: number | null): CsvCell {
  return ms == null ? "—" : round(ms / 86_400_000, 1)
}

function topRoasSection(
  top: PeriodReportResult["top_by_roas"]
): CsvCell[][] {
  if (top.length === 0) return []
  return [
    [],
    ["Top hạng mục theo ROAS"],
    ["Mã", "ROAS", "Chi phí"],
    ...top.map((t) => [t.code, round(t.roas), round(t.spend, 2)] as CsvCell[]),
  ]
}

export function reportCsvRows(r: PeriodReportResult): CsvCell[][] {
  const rows: CsvCell[][] = [
    [`Báo cáo ${KIND_LABEL[r.period.kind]}`, `bắt đầu ${r.period.start_date}`],
    [r.has_data ? "" : "Chưa có dữ liệu trong kỳ"],
    [],
    ["Chỉ số", "Giá trị"],
    ...METRIC_ORDER.map((m) => [METRIC_LABEL[m], round(r[m])] as CsvCell[]),
  ]
  return [...rows, ...topRoasSection(r.top_by_roas)]
}

export function comparisonCsvRows(r: PeriodComparisonResult): CsvCell[][] {
  const rows: CsvCell[][] = [
    [
      `Báo cáo ${KIND_LABEL[r.period.kind]}`,
      `${r.period.start_date} vs ${r.previous_period.start_date}`,
    ],
    [r.current.has_data ? "" : "Chưa có dữ liệu trong kỳ"],
    [],
    ["Chỉ số", "Kỳ này", "Kỳ trước", "Chênh lệch", "%", "Hướng"],
    ...METRIC_ORDER.map((m) => {
      const d = r.deltas[m]
      return [
        METRIC_LABEL[m],
        round(d.current),
        round(d.previous),
        round(d.abs),
        d.pct == null ? "—" : `${round(d.pct * 100, 1)}%`,
        DIRECTION_LABEL[d.direction],
      ] as CsvCell[]
    }),
  ]
  return [...rows, ...topRoasSection(r.current.top_by_roas)]
}

export function peopleCsvRows(r: PeoplePerformanceResult): CsvCell[][] {
  return [
    ["Bảng theo nhân sự", `${localDate(r.period.from)} → ${localDate(r.period.to)}`],
    [],
    [
      "Nhân sự",
      "Đang thực hiện",
      "Hoàn tất trong kỳ",
      "Quá hạn",
      "Thời gian TB nhận→duyệt (ngày)",
    ],
    ...r.people.map(
      (p) =>
        [
          p.name,
          p.in_progress,
          p.completed_in_period,
          p.overdue,
          days(p.avg_lead_time_ms),
        ] as CsvCell[]
    ),
  ]
}
