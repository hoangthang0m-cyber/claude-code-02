"use client"

import * as React from "react"
import { BellIcon, PlusIcon, XIcon } from "lucide-react"

import {
  MAX_REMINDERS_PER_ITEM,
  REMINDER_UNITS,
  REMINDER_UNIT_LABELS,
  offsetToParts,
  partsToOffset,
  type Reminder,
  type ReminderUnit,
} from "@/lib/domain/calendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Editor for a Reminder[] — used for a sub-calendar's `defaultReminders`
// (task 4.3) and, later, per-item overrides (task 10.2). `allowPush` is off in
// v1 (FCM deferred, spec doc answer #3).
export function RemindersField({
  value,
  onChange,
  allowPush = false,
}: {
  value: Reminder[]
  onChange: (next: Reminder[]) => void
  allowPush?: boolean
}) {
  const atMax = value.length >= MAX_REMINDERS_PER_ITEM

  function update(index: number, next: Reminder) {
    onChange(value.map((r, i) => (i === index ? next : r)))
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">Không nhắc</p>
      )}
      {value.map((reminder, index) => {
        const { value: amount, unit } = offsetToParts(reminder.offsetMinutes)
        return (
          <div key={index} className="flex items-center gap-2">
            <BellIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              type="number"
              min={0}
              className="w-20"
              value={amount}
              onChange={(e) =>
                update(index, {
                  ...reminder,
                  offsetMinutes: partsToOffset(Number(e.target.value), unit),
                })
              }
            />
            <Select
              value={unit}
              onValueChange={(u) =>
                u &&
                update(index, {
                  ...reminder,
                  offsetMinutes: partsToOffset(amount, u as ReminderUnit),
                })
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {REMINDER_UNIT_LABELS[u]} trước
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allowPush && (
              <Select
                value={reminder.channel}
                onValueChange={(c) =>
                  c &&
                  update(index, {
                    ...reminder,
                    channel: c as Reminder["channel"],
                  })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inapp">Chuông</SelectItem>
                  <SelectItem value="push">Chuông + đẩy</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              <XIcon />
              <span className="sr-only">Xoá mốc nhắc</span>
            </Button>
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={atMax}
        onClick={() =>
          onChange([...value, { offsetMinutes: 10, channel: "inapp" }])
        }
      >
        <PlusIcon />
        Thêm mốc nhắc
      </Button>
      {atMax && (
        <p className="text-xs text-muted-foreground">
          Tối đa {MAX_REMINDERS_PER_ITEM} mốc nhắc
        </p>
      )}
    </div>
  )
}
