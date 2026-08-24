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
  CONTENT_STATUS_BADGE_VARIANT,
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  type ContentStatus,
} from "@/constants/contentStatus"

export function StatusSelect({
  value,
  onChange,
  disabled,
}: {
  value: ContentStatus
  onChange: (value: ContentStatus) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as ContentStatus)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue>
          <Badge variant={CONTENT_STATUS_BADGE_VARIANT[value]}>
            {CONTENT_STATUS_LABELS[value]}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CONTENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            <Badge variant={CONTENT_STATUS_BADGE_VARIANT[status]}>
              {CONTENT_STATUS_LABELS[status]}
            </Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
