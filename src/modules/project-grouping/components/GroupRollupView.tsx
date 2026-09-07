"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { toast } from "sonner"

import {
  ACTUAL_COST_CURRENCY,
  COMPARED_METRICS,
  COMPARED_METRIC_LABELS,
  computeGroupBudgetReconciliation,
  computeGroupTimeStatus,
  groupNeedsObjective,
} from "@/lib/domain"
import { formatMoney } from "@/utils/format"
import { downloadCsv } from "@/modules/analytics/services/analytics.client"
import type { ReportKind } from "@/modules/analytics/services/analytics.client"
import { useProjectGroup } from "@/modules/project-grouping/hooks/useProjectGroup"
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

// task 3.5 — a human label for the period the numbers cover, from the report's
// own `start_date` (avoids the +07 boundary issues of the raw ms).
function periodLabel(kind: string, startDate: string): string {
  const [y, m, d] = startDate.split("-").map(Number)
  if (!y || !m || !d) return startDate
  if (kind === "month") return `tháng ${m}/${y}`
  const start = new Date(Date.UTC(y, m - 1, d))
  const end = new Date(start.getTime() + 6 * 86_400_000)
  const dm = (x: Date) =>
    `${String(x.getUTCDate()).padStart(2, "0")}/${String(
      x.getUTCMonth() + 1
    ).padStart(2, "0")}`
  return `tuần ${dm(start)}–${dm(end)}/${end.getUTCFullYear()}`
}

function Info({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap">{value}</dd>
    </div>
  )
}

export function GroupRollupView({ groupId }: { groupId: string }) {
  const { group } = useProjectGroup(groupId)
  const [dash, setDash] = React.useState<GroupDashboardResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [kind, setKind] = React.useState<ReportKind>("month")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [compare, setCompare] = React.useState(false)
  // one clock read at mount — the time status is day-granular (task 3.6)
  const [nowMs] = React.useState(() => Date.now())

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

  const period = meta?.period
  const scopeLabel = period ? periodLabel(period.kind, period.start_date) : null
  const actualSpend = cur?.total_spend ?? 0
  const recon = group
    ? computeGroupBudgetReconciliation({
        budgetAmount: group.budget_amount,
        budgetCurrency: group.budget_currency,
        actualSpend,
      })
    : null
  const timeStatus = group
    ? computeGroupTimeStatus(group.target_end_date, nowMs)
    : null
  const hasGroupInfo =
    !!group &&
    (!!group.objective ||
      !!group.description ||
      !!group.time_scope_text ||
      !!group.target_end_date ||
      group.budget_amount != null)

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

      {group && groupNeedsObjective(group) && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          Nhóm này chưa có mục tiêu — bấm “Sửa nhóm” ở danh sách dự án để bổ sung.
        </p>
      )}

      {/* period selector — drives both the info blocks below and the report */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onValueChange={(v) => v && setKind(v as ReportKind)}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue>{kind === "month" ? "Tháng" : "Tuần"}</SelectValue>
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
      </div>

      {/* "Thông tin nhóm" (task 3.1) */}
      {hasGroupInfo && group && (
        <Card size="sm" className="gap-3 p-4">
          <span className="text-sm font-semibold">Thông tin nhóm</span>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Mục tiêu" value={group.objective} />
            <Info label="Mô tả chi tiết" value={group.description} />
            <Info label="Quy mô thời gian" value={group.time_scope_text} />
            <Info
              label="Ngày kết thúc dự kiến"
              value={
                group.target_end_date
                  ? new Date(
                      `${group.target_end_date}T00:00:00Z`
                    ).toLocaleDateString("vi-VN")
                  : undefined
              }
            />
            <Info
              label="Ngân sách dự kiến"
              value={
                group.budget_amount != null
                  ? formatMoney(
                      group.budget_amount,
                      group.budget_currency ?? "VND"
                    )
                  : undefined
              }
            />
          </dl>
        </Card>
      )}

      {/* "Ngân sách & tiến độ thời gian" (tasks 3.2–3.6) */}
      {group && (
        <Card size="sm" className="gap-3 p-4">
          <span className="text-sm font-semibold">
            Ngân sách &amp; tiến độ thời gian
          </span>

          <div className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted-foreground">
                Chi phí thực tế{scopeLabel ? ` (${scopeLabel})` : ""}:
              </span>
              <span className="font-medium">
                {loading || !cur
                  ? "—"
                  : formatMoney(actualSpend, ACTUAL_COST_CURRENCY)}
              </span>
            </div>

            {recon && recon.state === "no_budget" && (
              <p className="text-xs text-muted-foreground">
                Nhóm chưa đặt ngân sách dự kiến.
              </p>
            )}

            {recon &&
              (recon.state === "within" || recon.state === "over") && (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-muted-foreground">
                      Ngân sách dự kiến:
                    </span>
                    <span className="font-medium">
                      {formatMoney(recon.budget_amount, recon.budget_currency)}
                    </span>
                  </div>
                  <p
                    className={
                      recon.state === "over"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    Đã dùng {Math.round(recon.percent_used * 100)}% ngân sách
                    {scopeLabel ? ` (chi phí trong ${scopeLabel})` : ""}
                    {recon.state === "over" && (
                      <> — vượt {formatMoney(recon.over_amount, recon.budget_currency)}</>
                    )}
                  </p>
                </>
              )}

            {recon && recon.state === "currency_mismatch" && (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted-foreground">
                    Ngân sách dự kiến:
                  </span>
                  <span className="font-medium">
                    {formatMoney(recon.budget_amount, recon.budget_currency)}
                  </span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Ngân sách ({recon.budget_currency}) và chi phí thực tế (
                  {recon.spend_currency}) khác đơn vị tiền tệ — không so sánh
                  trực tiếp được.
                </p>
              </>
            )}

            {timeStatus && (
              <div className="flex flex-wrap items-baseline gap-x-2 pt-1">
                <span className="text-muted-foreground">
                  Tình trạng thời gian:
                </span>
                <span
                  className={
                    timeStatus.state === "overdue"
                      ? "font-medium text-destructive"
                      : timeStatus.state === "due_soon"
                        ? "font-medium text-amber-700 dark:text-amber-400"
                        : "font-medium"
                  }
                >
                  {timeStatus.state === "on_track" &&
                    `Đang trong hạn — còn ${timeStatus.days_left} ngày`}
                  {timeStatus.state === "due_soon" &&
                    `Sắp hết hạn — còn ${timeStatus.days_left} ngày`}
                  {timeStatus.state === "overdue" &&
                    `Quá hạn ${timeStatus.days_over} ngày`}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

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
          <span className="text-sm font-semibold">
            Báo cáo {kind === "month" ? "tháng" : "tuần"}
            {scopeLabel ? ` — ${scopeLabel}` : ""}
          </span>
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
