// SPEC §5.6 R3 / R4, §8 Q4 (answered 2026-08-29): weekly / monthly report
// periods are computed in Asia/Ho_Chi_Minh (UTC+7, no DST) with a Monday week
// start (ISO-8601). Because the offset is fixed there is no DST arithmetic — a
// local wall-clock time is just `UTC - 7h`.

export const ICT_OFFSET_MS = 7 * 60 * 60 * 1000

export type ReportPeriodKind = "week" | "month"

export interface ReportPeriod {
  kind: ReportPeriodKind
  /** epoch ms, inclusive — local midnight of the first day, as UTC */
  start: number
  /** epoch ms, exclusive — local midnight of the day after the last */
  end: number
  /** the immediately-preceding period of the same kind */
  previous: { start: number; end: number }
  /** the local calendar date the period starts on, YYYY-MM-DD */
  start_date: string
}

// local wall-clock midnight (Asia/Ho_Chi_Minh) of a Y-M-D, as an epoch ms.
function localMidnight(y: number, m0: number, d: number): number {
  return Date.UTC(y, m0, d) - ICT_OFFSET_MS
}

function isoDate(ms: number): string {
  // ms is a local-midnight instant; shift back into "local" before formatting
  return new Date(ms + ICT_OFFSET_MS).toISOString().slice(0, 10)
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Resolve `date` (a YYYY-MM-DD in local time) + `kind` into period bounds.
// Throws on a malformed date string.
export function resolveReportPeriod(
  kind: ReportPeriodKind,
  date: string
): ReportPeriod {
  const m = DATE_RE.exec(date.trim())
  if (!m) throw new Error(`Ngày không hợp lệ: "${date}" (cần YYYY-MM-DD)`)
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const anchor = new Date(Date.UTC(y, mo, d))
  if (
    anchor.getUTCFullYear() !== y ||
    anchor.getUTCMonth() !== mo ||
    anchor.getUTCDate() !== d
  ) {
    throw new Error(`Ngày không hợp lệ: "${date}"`)
  }

  if (kind === "month") {
    const start = localMidnight(y, mo, 1)
    const end = localMidnight(y, mo + 1, 1)
    const prevStart = localMidnight(y, mo - 1, 1)
    return {
      kind,
      start,
      end,
      previous: { start: prevStart, end: start },
      start_date: isoDate(start),
    }
  }

  // week — back up to Monday (ISO: Mon=0 … Sun=6)
  const weekday = anchor.getUTCDay() // 0 Sun … 6 Sat
  const daysFromMonday = (weekday + 6) % 7
  const start = localMidnight(y, mo, d - daysFromMonday)
  const WEEK = 7 * 24 * 60 * 60 * 1000
  return {
    kind,
    start,
    end: start + WEEK,
    previous: { start: start - WEEK, end: start },
    start_date: isoDate(start),
  }
}
