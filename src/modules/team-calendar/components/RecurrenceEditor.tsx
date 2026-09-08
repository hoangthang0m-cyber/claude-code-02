"use client"

import * as React from "react"

import {
  describeRecurrence,
  partsToRRuleString,
  previewOccurrences,
  rruleStringToParts,
  toVnInputDate,
  vnDateKey,
  type RecurrenceFreq,
  type RecurrenceParts,
} from "@/lib/domain/calendar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

const PRESETS: Record<string, RecurrenceFreq> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  yearly: "YEARLY",
}

// task 8.2 — the recurrence rule builder inside the item editor. `value` is the
// stored RRULE body (or null); `onChange` gets the new one.
export function RecurrenceEditor({
  value,
  startDayKey,
  startMs,
  onChange,
}: {
  value: string | null
  startDayKey: string
  startMs: number
  onChange: (rule: string | null) => void
}) {
  const parts: RecurrenceParts | null = value
    ? safeParse(value)
    : null

  function emit(next: RecurrenceParts) {
    onChange(partsToRRuleString(next, startDayKey))
  }

  const freqValue = parts?.freq ?? NONE

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={freqValue}
        onValueChange={(v) => {
          if (!v || v === NONE) return onChange(null)
          emit({
            freq: PRESETS[v.toLowerCase()] ?? "WEEKLY",
            interval: 1,
            weekdays:
              v === "weekly"
                ? [new Date(`${startDayKey}T00:00:00Z`).getUTCDay()]
                : [],
            monthlyMode: "date",
            end: { type: "never" },
          })
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Không lặp</SelectItem>
          <SelectItem value="daily">Hàng ngày</SelectItem>
          <SelectItem value="weekly">Hàng tuần</SelectItem>
          <SelectItem value="monthly">Hàng tháng</SelectItem>
          <SelectItem value="yearly">Hàng năm</SelectItem>
        </SelectContent>
      </Select>

      {parts && (
        <div className="flex flex-col gap-2 rounded border p-2 text-sm">
          <label className="flex items-center gap-2">
            Mỗi
            <Input
              type="number"
              min={1}
              className="h-8 w-16"
              value={parts.interval}
              onChange={(e) =>
                emit({ ...parts, interval: Math.max(1, Number(e.target.value)) })
              }
            />
            {{ DAILY: "ngày", WEEKLY: "tuần", MONTHLY: "tháng", YEARLY: "năm" }[
              parts.freq
            ]}
          </label>

          {parts.freq === "WEEKLY" && (
            <div className="flex gap-1">
              {WEEKDAY_LABELS.map((label, jsDay) => (
                <button
                  key={jsDay}
                  type="button"
                  onClick={() =>
                    emit({
                      ...parts,
                      weekdays: parts.weekdays.includes(jsDay)
                        ? parts.weekdays.filter((d) => d !== jsDay)
                        : [...parts.weekdays, jsDay].sort((a, b) => a - b),
                    })
                  }
                  className={
                    "size-7 rounded-full text-xs " +
                    (parts.weekdays.includes(jsDay)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {parts.freq === "MONTHLY" && (
            <Select
              value={parts.monthlyMode}
              onValueChange={(v) =>
                v && emit({ ...parts, monthlyMode: v as "date" | "weekday" })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">
                  Theo ngày ({vnDateKey(startMs).slice(8)})
                </SelectItem>
                <SelectItem value="weekday">Theo thứ N của tháng</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            Kết thúc
            <Select
              value={parts.end.type}
              onValueChange={(v) => {
                if (v === "never") emit({ ...parts, end: { type: "never" } })
                if (v === "count")
                  emit({ ...parts, end: { type: "count", count: 10 } })
                if (v === "until")
                  emit({
                    ...parts,
                    end: { type: "until", date: toVnInputDate(startMs) },
                  })
              }}
            >
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Không bao giờ</SelectItem>
                <SelectItem value="count">Sau N lần</SelectItem>
                <SelectItem value="until">Vào ngày</SelectItem>
              </SelectContent>
            </Select>
            {parts.end.type === "count" && (
              <Input
                type="number"
                min={1}
                className="h-8 w-16"
                value={parts.end.count}
                onChange={(e) =>
                  emit({
                    ...parts,
                    end: { type: "count", count: Number(e.target.value) },
                  })
                }
              />
            )}
            {parts.end.type === "until" && (
              <Input
                type="date"
                className="h-8"
                value={parts.end.date}
                onChange={(e) =>
                  emit({
                    ...parts,
                    end: { type: "until", date: e.target.value },
                  })
                }
              />
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {describeRecurrence(parts)}
          </p>
          {value && (
            <p className="text-xs text-muted-foreground">
              Kế tiếp:{" "}
              {previewOccurrences(value, startMs, 3)
                .map((ms) => vnDateKey(ms))
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function safeParse(rule: string): RecurrenceParts | null {
  try {
    return rruleStringToParts(rule)
  } catch {
    return null
  }
}
