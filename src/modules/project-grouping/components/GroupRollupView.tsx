"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { COMPARED_METRICS, COMPARED_METRIC_LABELS } from "@/lib/domain"
import { downloadCsv } from "@/modules/analytics/services/analytics.client"
import type { ReportKind } from "@/modules/analytics/services/analytics.client"
import {
  getGroupComparison,
  getGroupDashboard,
  getGroupReport,
  groupReportCsvUrl,
  type GroupComparisonResult,
  type GroupDashboardResult,
  type GroupReportResult,
} from "@/modules/project-grouping/services/groupRollup.client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const CARDS = [
  ["total", "Tổng hạng mục"],
  ["in_production", "Đang sản xuất"],
  ["pending_review", "Chờ duyệt"],
  ["overdue", "Quá hạn"],
  ["published", "Đã lên ads"],
  ["ads_running", "Ads đang chạy"],
] as const

const num = (n: number) => Math.round(n * 100) / 100
const pct = (p: number | null) =>
  p == null ? "—" : `${p > 0 ? "+" : ""}${Math.round(p * 1000) / 10}%`
const ARROW = { up: "▲", down: "▼", flat: "–" } as const

export function GroupRollupView({ groupId }: { groupId: string }) {
  const [dash, setDash] = React.useState<GroupDashboardResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [kind, setKind] = React.useState<ReportKind>("month")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [compare, setCompare] = React.useState(false)

  const key = `${kind}|${date}|${compare}`
  const [report, setReport] = React.useState<{
    key: string
    r: GroupReportResult | null
    c: GroupComparisonResult | null
  } | null>(null)

  React.useEffect(() => {
    let off = false
    getGroupDashboard(groupId)
      .then((d) => !off && setDash(d))
      .catch((e) => !off && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      off = true
    }
  }, [groupId])

  React.useEffect(() => {
    let off = false
    const p = compare
      ? getGroupComparison(groupId, kind, date).then(
          (c) => !off && setReport({ key, r: null, c })
        )
      : getGroupReport(groupId, kind, date).then(
          (r) => !off && setReport({ key, r, c: null })
        )
    p.catch((e) => !off && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      off = true
    }
  }, [groupId, key, kind, date, compare])

  const fresh = report?.key === key ? report : null
  const cur = compare ? fresh?.c?.current : fresh?.r
  const meta = compare ? fresh?.c : fresh?.r
  const loading = compare ? fresh?.c == null : fresh?.r == null

  async function exportCsv() {
    try {
      await downloadCsv(groupReportCsvUrl(groupId, kind, date))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link
          href="/campaigns"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" /> Danh sách dự án
        </Link>
        <h1 className="text-xl font-semibold">
          {dash?.group.name ?? "Nhóm dự án"}
        </h1>
        {dash && (
          <p className="text-xs text-muted-foreground">
            {dash.projects_total === 0
              ? "Nhóm chưa có dự án"
              : `Đang tính ${dash.projects_counted}/${dash.projects_total} dự án trong nhóm`}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* stat cards (task 5.6) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map(([k, label]) => (
          <Card key={k} size="sm" className="gap-1 p-3">
            <span className="text-xs text-muted-foreground">{label}</span>
            {dash ? (
              <span
                className={
                  k === "overdue" && dash[k] > 0
                    ? "text-2xl font-semibold text-destructive"
                    : "text-2xl font-semibold"
                }
              >
                {dash[k]}
              </span>
            ) : (
              <Skeleton className="h-7 w-10" />
            )}
          </Card>
        ))}
      </div>

      {/* weekly/monthly report (task 5.6) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={kind} onValueChange={(v) => v && setKind(v as ReportKind)}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Tuần</SelectItem>
              <SelectItem value="month">Tháng</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-8 w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={compare}
              onCheckedChange={(c) => setCompare(c === true)}
            />
            So sánh với kỳ trước
          </label>
          <Button
            size="xs"
            variant="outline"
            className="ml-auto"
            onClick={exportCsv}
            disabled={loading}
          >
            Xuất CSV
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : meta?.group_empty ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nhóm chưa có dự án
          </p>
        ) : cur && !cur.has_data ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu trong kỳ
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Chỉ số</TableHead>
                  <TableHead>Kỳ này</TableHead>
                  {compare && <TableHead>Kỳ trước</TableHead>}
                  {compare && <TableHead>Thay đổi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {COMPARED_METRICS.map((m) => {
                  const d = fresh?.c?.deltas[m]
                  return (
                    <TableRow key={m}>
                      <TableCell>{COMPARED_METRIC_LABELS[m]}</TableCell>
                      <TableCell>{num(cur?.[m] ?? 0)}</TableCell>
                      {compare && <TableCell>{num(d?.previous ?? 0)}</TableCell>}
                      {compare && (
                        <TableCell
                          className={
                            d?.direction === "up"
                              ? "text-emerald-600"
                              : d?.direction === "down"
                                ? "text-destructive"
                                : "text-muted-foreground"
                          }
                        >
                          {d
                            ? `${ARROW[d.direction]} ${num(d.abs)} (${pct(d.pct)})`
                            : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {cur?.has_data && cur.top_by_roas.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              Top hạng mục theo ROAS
            </p>
            <ul className="text-sm">
              {cur.top_by_roas.map((t) => (
                <li key={t.content_item_id} className="flex justify-between py-0.5">
                  <span>{t.code}</span>
                  <span className="text-muted-foreground">
                    ROAS {num(t.roas)} · chi phí {num(t.spend)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
