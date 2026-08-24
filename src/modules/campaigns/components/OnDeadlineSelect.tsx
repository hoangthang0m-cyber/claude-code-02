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
  ON_DEADLINE_STATUS_BADGE_VARIANT,
  ON_DEADLINE_STATUS_LABELS,
  ON_DEADLINE_STATUSES,
  type OnDeadlineStatus,
} from "@/constants/onDeadlineStatus"

export function OnDeadlineSelect({
  value,
  onChange,
  disabled,
}: {
  value?: OnDeadlineStatus
  onChange: (value: OnDeadlineStatus) => void
  disabled?: boolean
}) {
  const current = value ?? "not_evaluated"

  return (
    <Select
      value={current}
      onValueChange={(next) => onChange(next as OnDeadlineStatus)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          <Badge variant={ON_DEADLINE_STATUS_BADGE_VARIANT[current]}>
            {ON_DEADLINE_STATUS_LABELS[current]}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ON_DEADLINE_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <Badge variant={ON_DEADLINE_STATUS_BADGE_VARIANT[status]}>
              {ON_DEADLINE_STATUS_LABELS[status]}
            </Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
