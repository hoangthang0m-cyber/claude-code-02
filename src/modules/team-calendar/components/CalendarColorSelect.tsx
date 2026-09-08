"use client"

import {
  CALENDAR_COLORS,
  CALENDAR_COLOR_KEYS,
  type CalendarColorKey,
} from "@/lib/domain/calendar"
import { cn } from "@/utils/cn"

// A swatch grid for picking a calendar colour (Mục B `team-calendar` —
// "chọn từ bảng màu định sẵn"). `value` of null renders nothing selected
// (used for a per-viewer override that clears back to the calendar default).
export function CalendarColorSelect({
  value,
  onChange,
  allowClear = false,
}: {
  value: CalendarColorKey | null
  onChange: (next: CalendarColorKey | null) => void
  allowClear?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CALENDAR_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          title={CALENDAR_COLORS[key].label}
          aria-pressed={value === key}
          onClick={() => onChange(value === key && allowClear ? null : key)}
          className={cn(
            "size-6 rounded-full border transition",
            value === key
              ? "ring-2 ring-ring ring-offset-1"
              : "border-transparent hover:scale-110"
          )}
          style={{ backgroundColor: CALENDAR_COLORS[key].hex }}
        />
      ))}
    </div>
  )
}
