import {
  ICT_OFFSET_MS,
  resolveReportPeriod,
  type ReportPeriodKind,
} from "@/lib/domain"
import { HttpError } from "@/lib/server/http"

// ads-overview-reporting change. Resolve a report request's time window to a
// pair of inclusive `stat_date` strings (snapshots key on the local calendar
// date, not epoch ms). Accepts either `?period=week|month&date=YYYY-MM-DD`
// (week / month bounds via the shared progress-analytics definition) or an
// arbitrary `?from=YYYY-MM-DD&to=YYYY-MM-DD`.

export interface ReportWindow {
  /** YYYY-MM-DD, inclusive */
  from: string
  /** YYYY-MM-DD, inclusive */
  to: string
  label: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

function msToDate(ms: number): string {
  return new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10)
}

export function resolveReportWindow(params: URLSearchParams): ReportWindow {
  const period = params.get("period")
  const from = params.get("from")
  const to = params.get("to")

  if (period) {
    if (period !== "week" && period !== "month") {
      throw new HttpError(400, "period phải là 'week' hoặc 'month'")
    }
    const date = params.get("date")
    if (!date || !DATE_RE.test(date)) {
      throw new HttpError(400, "Thiếu hoặc sai 'date' (YYYY-MM-DD)")
    }
    let p
    try {
      p = resolveReportPeriod(period as ReportPeriodKind, date)
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Ngày không hợp lệ"
      )
    }
    return {
      from: msToDate(p.start),
      to: msToDate(p.end - DAY_MS),
      label: `${period} ${p.start_date}`,
    }
  }

  if (from || to) {
    if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new HttpError(400, "Cần cả 'from' và 'to' dạng YYYY-MM-DD")
    }
    if (from > to) {
      throw new HttpError(400, "'from' phải <= 'to'")
    }
    return { from, to, label: `${from} → ${to}` }
  }

  throw new HttpError(400, "Cần 'period'+'date' hoặc 'from'+'to'")
}

// task 4.4: the requested week/month window and the one immediately before it.
// Comparison is only defined for a named period, not an arbitrary from/to range.
export function resolveComparisonWindows(params: URLSearchParams): {
  current: ReportWindow
  previous: ReportWindow
} {
  const period = params.get("period")
  const date = params.get("date")
  if (period !== "week" && period !== "month") {
    throw new HttpError(400, "So sánh kỳ cần period 'week' hoặc 'month'")
  }
  if (!date || !DATE_RE.test(date)) {
    throw new HttpError(400, "Thiếu hoặc sai 'date' (YYYY-MM-DD)")
  }
  let p
  try {
    p = resolveReportPeriod(period as ReportPeriodKind, date)
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Ngày không hợp lệ")
  }
  return {
    current: {
      from: msToDate(p.start),
      to: msToDate(p.end - DAY_MS),
      label: `${period} ${p.start_date}`,
    },
    previous: {
      from: msToDate(p.previous.start),
      to: msToDate(p.previous.end - DAY_MS),
      label: `${period} ${p.previous.start_date}`,
    },
  }
}
