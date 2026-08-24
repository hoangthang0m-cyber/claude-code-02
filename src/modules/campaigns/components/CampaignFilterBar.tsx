"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CAMPAIGN_PRIORITIES, CAMPAIGN_PRIORITY_LABELS } from "@/constants/priority"
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/constants/status"
import type {
  CampaignFiltersState,
  CampaignSortBy,
} from "@/modules/campaigns/hooks/useCampaignFilters"
import { SearchIcon } from "lucide-react"

export function CampaignFilterBar({
  filters,
  onChange,
  assigneeOptions,
}: {
  filters: CampaignFiltersState
  onChange: (filters: CampaignFiltersState) => void
  assigneeOptions: string[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Tìm theo tiêu đề, mô tả, người phụ trách..."
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      <Select
        value={filters.status}
        onValueChange={(value) =>
          onChange({ ...filters, status: value as CampaignFiltersState["status"] })
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          {CAMPAIGN_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {CAMPAIGN_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priority}
        onValueChange={(value) =>
          onChange({ ...filters, priority: value as CampaignFiltersState["priority"] })
        }
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Độ ưu tiên" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả độ ưu tiên</SelectItem>
          {CAMPAIGN_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {CAMPAIGN_PRIORITY_LABELS[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.assigneeId}
        onValueChange={(value) => onChange({ ...filters, assigneeId: value ?? "all" })}
      >
        <SelectTrigger size="sm" className="w-40">
          <SelectValue placeholder="Người phụ trách" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả người phụ trách</SelectItem>
          {assigneeOptions.map((assignee) => (
            <SelectItem key={assignee} value={assignee}>
              {assignee}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.sortBy}
        onValueChange={(value) => onChange({ ...filters, sortBy: value as CampaignSortBy })}
      >
        <SelectTrigger size="sm" className="w-44">
          <SelectValue placeholder="Sắp xếp" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="createdAt">Mới tạo trước</SelectItem>
          <SelectItem value="dueDate">Hạn chót gần nhất</SelectItem>
          <SelectItem value="priority">Độ ưu tiên cao nhất</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
