import type { CsvCell } from "@/lib/csv"
import { COMPARED_METRICS, COMPARED_METRIC_LABELS } from "@/lib/domain"

import type { GroupReportPerProject } from "@/modules/project-grouping/services/groupRollup.server"

// task 5.5 — the group report as CSV: one COLUMN per child project, one ROW per
// metric. NO group-total column or row (design Decision 6) — the reader adds up
// or reads the on-screen total.

const KIND_LABEL = { week: "Tuần", month: "Tháng" } as const

function round(n: number, dp = 4): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

export function groupReportCsvRows(r: GroupReportPerProject): CsvCell[][] {
  const header: CsvCell[] = [
    "Chỉ số",
    ...r.projects.map((p) => p.name),
  ]

  const metricRows: CsvCell[][] = COMPARED_METRICS.map((m) => [
    COMPARED_METRIC_LABELS[m],
    ...r.projects.map((p) => round(p.report[m])),
  ])

  return [
    [
      `Báo cáo ${KIND_LABEL[r.period.kind]} — nhóm "${r.group.name}"`,
      `bắt đầu ${r.period.start_date}`,
    ],
    [
      r.group_empty
        ? "Nhóm chưa có dự án"
        : `Đang tính ${r.projects_counted}/${r.projects_total} dự án trong nhóm`,
    ],
    [],
    header,
    ...metricRows,
  ]
}
