"use client"

import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PRIORITY_BADGE_VARIANT,
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  type PriorityLevel,
} from "@/constants/priority"

export function PrioritySelect({
  value,
  onChange,
  disabled,
}: {
  value?: PriorityLevel
  onChange: (value: PriorityLevel) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(next) => next && onChange(next as PriorityLevel)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder="Chưa đặt">
          {value ? (
            <Badge variant={PRIORITY_BADGE_VARIANT[value]}>{PRIORITY_LABELS[value]}</Badge>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            <Badge variant={PRIORITY_BADGE_VARIANT[level]}>{PRIORITY_LABELS[level]}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
