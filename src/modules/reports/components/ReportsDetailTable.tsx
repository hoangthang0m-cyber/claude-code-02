"use client"

import * as React from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useUsers } from "@/hooks/useUsers"
import { CONTENT_STATUS_BADGE_VARIANT, CONTENT_STATUS_LABELS } from "@/constants/contentStatus"
import { formatCurrency, formatRoas } from "@/utils/format"
import { formatDate } from "@/utils/date"
import type { PerformanceRecord } from "@/modules/reports/types/report.types"
import { ArrowDownIcon, ArrowUpIcon, SearchIcon } from "lucide-react"

type SortKey = "reportDate" | "adSpend" | "revenue" | "roas" | "cpp"

const SORT_LABELS: Record<SortKey, string> = {
  reportDate: "Ngày",
  adSpend: "Chi phí",
  revenue: "Doanh thu",
  roas: "ROAS",
  cpp: "CPP",
}

function SortHeader({
  sortKey: key,
  activeSortKey,
  sortDesc,
  onToggle,
}: {
  sortKey: SortKey
  activeSortKey: SortKey
  sortDesc: boolean
  onToggle: (key: SortKey) => void
}) {
  const isActive = key === activeSortKey
  return (
    <button
      type="button"
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() => onToggle(key)}
    >
      {SORT_LABELS[key]}
      {isActive &&
        (sortDesc ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />)}
    </button>
  )
}

export function ReportsDetailTable({ records }: { records: PerformanceRecord[] }) {
  const { users } = useUsers()
  const nameById = React.useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])
  const [search, setSearch] = React.useState("")
  const [sortKey, setSortKey] = React.useState<SortKey>("reportDate")
  const [sortDesc, setSortDesc] = React.useState(true)

  const filtered = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const matches = query
      ? records.filter(
          ({ item }) =>
            item.scriptTitle.toLowerCase().includes(query) ||
            (item.topic ?? "").toLowerCase().includes(query)
        )
      : records

    const sorted = [...matches].sort((a, b) => {
      const av = sortKey === "reportDate" ? (a.item.reportDate?.toMillis() ?? 0) : (a.item[sortKey] ?? 0)
      const bv = sortKey === "reportDate" ? (b.item.reportDate?.toMillis() ?? 0) : (b.item[sortKey] ?? 0)
      return sortDesc ? bv - av : av - bv
    })
    return sorted
  }, [records, search, sortKey, sortDesc])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  return (
    <Card className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both delay-150">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Chi tiết theo content</CardTitle>
          <div className="relative w-64">
            <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm theo kịch bản, chủ đề..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead>
                  <SortHeader sortKey="reportDate" activeSortKey={sortKey} sortDesc={sortDesc} onToggle={toggleSort} />
                </TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Chiến dịch</TableHead>
                <TableHead>Kịch bản</TableHead>
                <TableHead>Nhân sự</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>
                  <SortHeader sortKey="adSpend" activeSortKey={sortKey} sortDesc={sortDesc} onToggle={toggleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader sortKey="revenue" activeSortKey={sortKey} sortDesc={sortDesc} onToggle={toggleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader sortKey="roas" activeSortKey={sortKey} sortDesc={sortDesc} onToggle={toggleSort} />
                </TableHead>
                <TableHead>
                  <SortHeader sortKey="cpp" activeSortKey={sortKey} sortDesc={sortDesc} onToggle={toggleSort} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    Không có content nào khớp.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(({ item, campaign, categoryId, categoryName }) => (
                  <TableRow key={item.id} className="animate-in fade-in duration-300 fill-mode-both">
                    <TableCell className="whitespace-nowrap">{formatDate(item.reportDate)}</TableCell>
                    <TableCell className="whitespace-nowrap">{categoryName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {campaign && categoryId ? (
                        <Link
                          href={`/campaigns/${categoryId}/${campaign.id}`}
                          className="hover:underline"
                        >
                          {campaign.title || campaign.month}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {item.scriptTitle || item.topic || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.assigneeId ? (nameById.get(item.assigneeId) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={CONTENT_STATUS_BADGE_VARIANT[item.status]}>
                        {CONTENT_STATUS_LABELS[item.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(item.adSpend)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(item.revenue)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatRoas(item.roas)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(item.cpp)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
