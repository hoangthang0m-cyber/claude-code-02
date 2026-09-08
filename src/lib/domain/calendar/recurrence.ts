import { RRule, type Options } from "rrule"

import type { CalendarItem } from "@/lib/domain/calendar/calendarItem"
import {
  DAY_MS,
  ICT_OFFSET_MS,
  toMillis,
  vnDateKey,
  vnDayStartMs,
} from "@/lib/domain/calendar/dayFields"
import { computeDayFields } from "@/lib/domain/calendar/dayFields"
import type { RecurrenceException } from "@/lib/domain/calendar/recurrenceException"

// Recurrence handling with `rrule` (Mục C §4; Mục D group 8). No custom rule
// engine (Design Non-Goals). Occurrences are generated on read, never stored
// (task 8.7).
//
// The team runs one fixed-offset timezone, so every `rrule` computation is done
// in "VN wall clock" by shifting instants by +7h before handing them to `rrule`
// and shifting back afterwards — exact because there is no DST.

// ── Rule <-> parts (for the editor, task 8.2) ───────────────────────────────

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
export type RecurrenceMonthlyMode = "date" | "weekday" // "ngày 10" vs "thứ N"

export type RecurrenceEnd =
  | { type: "never" }
  | { type: "count"; count: number }
  | { type: "until"; date: string } // "YYYY-MM-DD", giờ VN

export interface RecurrenceParts {
  freq: RecurrenceFreq
  interval: number
  weekdays: number[] // JS weekday 0=Sun … 6=Sat (WEEKLY only)
  monthlyMode: RecurrenceMonthlyMode // MONTHLY only
  end: RecurrenceEnd
}

const RRULE_WEEKDAYS = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA]

function jsToRRuleWeekday(jsDay: number) {
  return RRULE_WEEKDAYS[jsDay]
}

// weekday (JS) + which occurrence in the month (1..5, -1 = last)
function weekdayPositionInMonth(dayKey: string): { jsWeekday: number; setpos: number } {
  const [y, m, d] = dayKey.split("-").map(Number)
  const jsWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const setpos = Math.ceil(d / 7)
  return { jsWeekday, setpos }
}

// A stored `recurrence` string is the RRULE body only (no DTSTART) — Google
// Calendar convention; DTSTART is the item's own startAt.
export function partsToRRuleString(
  parts: RecurrenceParts,
  dtstartDayKey: string
): string {
  const seg: string[] = [`FREQ=${parts.freq}`]
  if (parts.interval > 1) seg.push(`INTERVAL=${parts.interval}`)

  if (parts.freq === "WEEKLY" && parts.weekdays.length > 0) {
    seg.push(
      `BYDAY=${parts.weekdays
        .map((d) => jsToRRuleWeekday(d).toString())
        .join(",")}`
    )
  }
  if (parts.freq === "MONTHLY" && parts.monthlyMode === "weekday") {
    const { jsWeekday, setpos } = weekdayPositionInMonth(dtstartDayKey)
    seg.push(`BYDAY=${jsToRRuleWeekday(jsWeekday).toString()}`)
    seg.push(`BYSETPOS=${setpos}`)
  }

  if (parts.end.type === "count") seg.push(`COUNT=${parts.end.count}`)
  if (parts.end.type === "until") {
    // end of that VN day, expressed in the shifted (wall-clock-as-UTC) space
    seg.push(`UNTIL=${parts.end.date.replace(/-/g, "")}T235959Z`)
  }
  return seg.join(";")
}

export function rruleStringToParts(rule: string): RecurrenceParts {
  const opts = RRule.parseString(rule)
  const freq = freqName(opts.freq)
  const weekdays = (
    Array.isArray(opts.byweekday) ? opts.byweekday : opts.byweekday != null ? [opts.byweekday] : []
  )
    .map((w) => (typeof w === "number" ? w : (w as { weekday: number }).weekday))
    .map((rr) => (rr + 1) % 7) // rrule MO=0 … SU=6  →  JS SU=0

  let end: RecurrenceEnd = { type: "never" }
  if (opts.count) end = { type: "count", count: opts.count }
  else if (opts.until) {
    end = {
      type: "until",
      date: vnDateKey(opts.until.getTime() - ICT_OFFSET_MS),
    }
  }

  return {
    freq,
    interval: opts.interval ?? 1,
    weekdays,
    monthlyMode: opts.bysetpos != null ? "weekday" : "date",
    end,
  }
}

function freqName(f: Options["freq"] | undefined): RecurrenceFreq {
  switch (f) {
    case RRule.DAILY:
      return "DAILY"
    case RRule.MONTHLY:
      return "MONTHLY"
    case RRule.YEARLY:
      return "YEARLY"
    default:
      return "WEEKLY"
  }
}

const WEEKDAY_LABELS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]
const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  DAILY: "ngày",
  WEEKLY: "tuần",
  MONTHLY: "tháng",
  YEARLY: "năm",
}

export function describeRecurrence(parts: RecurrenceParts): string {
  const unit = FREQ_LABELS[parts.freq]
  let base =
    parts.interval > 1 ? `Mỗi ${parts.interval} ${unit}` : `Hàng ${unit}`
  if (parts.freq === "WEEKLY" && parts.weekdays.length > 0) {
    base += ` vào ${parts.weekdays.map((d) => WEEKDAY_LABELS[d]).join(", ")}`
  }
  if (parts.freq === "MONTHLY" && parts.monthlyMode === "weekday") {
    base += " theo thứ trong tháng"
  }
  if (parts.end.type === "count") base += `, ${parts.end.count} lần`
  if (parts.end.type === "until") base += `, đến ${parts.end.date}`
  return base
}

// ── Expansion (task 8.1 / 8.7) ─────────────────────────────────────────────

function buildRule(ruleText: string, dtstartMs: number): RRule {
  const opts = RRule.parseString(ruleText)
  opts.dtstart = new Date(dtstartMs + ICT_OFFSET_MS) // shift into VN wall clock
  return new RRule(opts)
}

// The next `n` occurrence start instants (epoch ms) — powers the editor preview.
export function previewOccurrences(
  ruleText: string,
  dtstartMs: number,
  n: number
): number[] {
  const rule = buildRule(ruleText, dtstartMs)
  return rule
    .all((_, i) => i < n)
    .map((d) => d.getTime() - ICT_OFFSET_MS)
}

// A rendered occurrence looks like a CalendarItem so every view / the popover
// can treat it uniformly; `occurrence` marks it as virtual (no Firestore doc).
export type RenderableItem = CalendarItem & {
  occurrence?: { masterId: string; occurrenceKey: string }
}

export function occurrenceId(masterId: string, occurrenceKey: string): string {
  return `${masterId}::${occurrenceKey}`
}

export function parseOccurrenceId(
  id: string
): { masterId: string; occurrenceKey: string } | null {
  const i = id.indexOf("::")
  return i < 0
    ? null
    : { masterId: id.slice(0, i), occurrenceKey: id.slice(i + 2) }
}

// Expand `master` across [windowStartDay, windowEndDay] (inclusive), applying
// `exceptions`. Never materialises anything.
export function expandRecurrence(
  master: CalendarItem,
  exceptions: readonly RecurrenceException[],
  windowStartDay: string,
  windowEndDay: string,
  cap = 400
): RenderableItem[] {
  if (!master.recurrence) return []

  const startMs = toMillis(master.startAt)
  const durationMs = toMillis(master.endAt) - startMs
  const rule = buildRule(master.recurrence, startMs)

  // widen by a couple of days so a "modified" exception that shifts an
  // occurrence into the window is not missed
  const from = new Date(vnDayStartMs(windowStartDay) + ICT_OFFSET_MS - 2 * DAY_MS)
  const to = new Date(vnDayStartMs(windowEndDay) + ICT_OFFSET_MS + 3 * DAY_MS)

  const byKey = new Map(exceptions.map((e) => [e.originalDateKey, e]))
  const out: RenderableItem[] = []

  const dates = rule.between(from, to, true).slice(0, cap)
  for (const d of dates) {
    const occStartMs = d.getTime() - ICT_OFFSET_MS
    const occKey = vnDateKey(occStartMs)
    const ex = byKey.get(occKey)
    if (ex?.action === "cancelled") continue

    const ov = ex?.overrides ?? {}
    const effStartMs = ov.startAt ? toMillis(ov.startAt) : occStartMs
    const effEndMs = ov.endAt ? toMillis(ov.endAt) : effStartMs + durationMs
    const allDay = ov.allDay ?? master.allDay

    const day = computeDayFields({ startAt: effStartMs, endAt: effEndMs, allDay })
    if (day.endDay < windowStartDay || day.startDay > windowEndDay) continue

    out.push({
      ...master,
      id: occurrenceId(master.id, occKey),
      title: ov.title ?? master.title,
      description: ov.description ?? master.description,
      location: ov.location ?? master.location,
      type: ov.type ?? master.type,
      allDay,
      startAt: timestampLike(effStartMs),
      endAt: timestampLike(effEndMs),
      startDay: day.startDay,
      endDay: day.endDay,
      spanDays: day.spanDays,
      dayKeys: day.dayKeys,
      isLongSpan: day.isLongSpan,
      colorOverride: ov.colorOverride ?? master.colorOverride,
      assigneeIds: ov.assigneeIds ?? master.assigneeIds,
      primaryAssigneeId:
        ov.primaryAssigneeId !== undefined
          ? ov.primaryAssigneeId
          : master.primaryAssigneeId,
      reminders: ov.reminders ?? master.reminders,
      occurrence: { masterId: master.id, occurrenceKey: occKey },
    })
  }
  return out
}

function timestampLike(ms: number): CalendarItem["startAt"] {
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1e6,
  } as unknown as CalendarItem["startAt"]
}

// ── Rule surgery for "this and following" / "this only" (tasks 8.4 / 8.5) ────

function ruleFields(ruleText: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const part of ruleText.split(";")) {
    const [k, v] = part.split("=")
    if (k) map.set(k.toUpperCase(), v ?? "")
  }
  return map
}

function fieldsToRule(map: Map<string, string>): string {
  const order = ["FREQ", "INTERVAL", "BYDAY", "BYSETPOS", "COUNT", "UNTIL"]
  return [...map.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(";")
}

// Cap a rule at the end of the VN day BEFORE `beforeDayKey`. Drops COUNT (the
// split branch carries a fresh, uncounted rule).
export function setRRuleUntil(ruleText: string, beforeDayKey: string): string {
  const [y, m, d] = beforeDayKey.split("-").map(Number)
  const prev = new Date(Date.UTC(y, m - 1, d - 1))
  const until = `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, "0")}${String(
    prev.getUTCDate()
  ).padStart(2, "0")}T235959Z`
  const map = ruleFields(ruleText)
  map.delete("COUNT")
  map.set("UNTIL", until)
  return fieldsToRule(map)
}

// The rule for a "this and following" split — the same recurrence pattern with
// no end cap (the user re-sets an end if they want one).
export function openEndedRule(ruleText: string): string {
  const map = ruleFields(ruleText)
  map.delete("UNTIL")
  map.delete("COUNT")
  return fieldsToRule(map)
}

// The instant a given occurrence starts (epoch ms), by matching its VN day
// against the expanded rule. Used server-side to stamp `originalStartAt`.
export function occurrenceStartMs(
  ruleText: string,
  masterStartMs: number,
  occurrenceKey: string
): number | null {
  const rule = buildRule(ruleText, masterStartMs)
  const dayStart = new Date(vnDayStartMs(occurrenceKey) + ICT_OFFSET_MS)
  const dayEnd = new Date(dayStart.getTime() + DAY_MS)
  const hits = rule.between(dayStart, dayEnd, true)
  return hits.length ? hits[0].getTime() - ICT_OFFSET_MS : null
}

// Default parts when a user first turns on recurrence for an item (task 8.3).
export function defaultRecurrenceParts(dtstartDayKey: string): RecurrenceParts {
  const jsWeekday = new Date(`${dtstartDayKey}T00:00:00Z`).getUTCDay()
  return {
    freq: "WEEKLY",
    interval: 1,
    weekdays: [jsWeekday],
    monthlyMode: "date",
    end: { type: "never" },
  }
}
