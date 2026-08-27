"use client"

import * as React from "react"
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
} from "@tanstack/react-table"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useUsers } from "@/hooks/useUsers"
import { CONTENT_STATUS_LABELS, CONTENT_STATUSES } from "@/constants/contentStatus"
import { ON_DEADLINE_STATUS_LABELS, ON_DEADLINE_STATUSES } from "@/constants/onDeadlineStatus"
import { ContentDetailDrawer } from "@/modules/campaigns/components/ContentDetailDrawer"
import { ContentRow } from "@/modules/campaigns/components/ContentRow"
import { ContentRowGroupHeader } from "@/modules/campaigns/components/ContentRowGroupHeader"
import { ImportContentCsvSheet } from "@/modules/campaigns/components/ImportContentCsvSheet"
import { createContentItem } from "@/modules/campaigns/services/contentItems.service"
import type { ContentItem } from "@/modules/campaigns/types/campaign.types"
import { PlusIcon } from "lucide-react"

const COLUMN_COUNT = 11

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, ContentItem>()

const columns = columnHelper.columns([
  columnHelper.accessor((item) => item.assigneeId ?? "", { id: "assigneeId" }),
  columnHelper.accessor((item) => item.status, { id: "status" }),
  columnHelper.accessor((item) => item.onDeadlineStatus ?? "", { id: "onDeadlineStatus" }),
])

export function ContentTrackingTable({
  campaignId,
  contentItems,
}: {
  campaignId: string
  contentItems: ContentItem[]
}) {
  const { user } = useAuth()
  const { users } = useUsers()
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [detailItem, setDetailItem] = React.useState<ContentItem | null>(null)

  const table = useTable({
    features,
    data: contentItems,
    columns,
    state: { columnFilters },
    getRowId: (row) => row.id,
    onColumnFiltersChange: setColumnFilters,
  })

  const filteredItems = table.getRowModel().rows.map((row) => row.original)

  const groups = React.useMemo(() => {
    const result: { label: string | null; items: ContentItem[] }[] = []
    for (const item of filteredItems) {
      const label = item.scriptGroupLabel?.trim() || null
      const lastGroup = result[result.length - 1]
      if (label && lastGroup?.label === label) {
        lastGroup.items.push(item)
      } else {
        result.push({ label, items: [item] })
      }
    }
    return result
  }, [filteredItems])

  function filterValue(columnId: string) {
    return (table.getColumn(columnId)?.getFilterValue() as string | undefined) ?? "all"
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filterValue("status")}
          onValueChange={(value) =>
            table.getColumn("status")?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {CONTENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {CONTENT_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterValue("assigneeId")}
          onValueChange={(value) =>
            table.getColumn("assigneeId")?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Nhân sự" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nhân sự</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterValue("onDeadlineStatus")}
          onValueChange={(value) =>
            table.getColumn("onDeadlineStatus")?.setFilterValue(value === "all" ? undefined : value)
          }
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Đúng deadline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            {ON_DEADLINE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {ON_DEADLINE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Deadline</TableHead>
              <TableHead>Nhân sự thực hiện</TableHead>
              <TableHead>Kịch bản</TableHead>
              <TableHead>Link video</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Mức ưu tiên</TableHead>
              <TableHead>Chủ đề</TableHead>
              <TableHead>Đúng deadline</TableHead>
              <TableHead>Báo cáo hiệu quả ads</TableHead>
              <TableHead>Đánh giá/Đề xuất</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center text-muted-foreground">
                  Chưa có content nào.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group, groupIndex) => (
                <React.Fragment key={group.label ?? `ungrouped-${groupIndex}`}>
                  {group.label && (
                    <ContentRowGroupHeader label={group.label} colSpan={COLUMN_COUNT} />
                  )}
                  {group.items.map((item) => (
                    <ContentRow
                      key={item.id}
                      campaignId={campaignId}
                      item={item}
                      onOpenDetail={setDetailItem}
                    />
                  ))}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => user && createContentItem(campaignId, user.uid)}
        >
          <PlusIcon />
          Thêm content
        </Button>
        <ImportContentCsvSheet campaignId={campaignId} />
      </div>

      <ContentDetailDrawer
        campaignId={campaignId}
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => !open && setDetailItem(null)}
      />
    </div>
  )
}
