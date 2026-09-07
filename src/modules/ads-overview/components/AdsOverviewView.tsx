"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"

import { downloadCsv } from "@/modules/analytics/services/analytics.client"
import {
  getProductReport,
  getReportComparison,
  getReportTimeseries,
  reportExportUrl,
  type ComparisonResponse,
  type Granularity,
  type PeriodKind,
  type ProductReportResponse,
  type ReportQuery,
  type TimeseriesResponse,
} from "@/modules/ads-overview/services/adsReporting.client"
import { ReportTrendChart } from "@/modules/ads-overview/components/ReportTrendChart"
import { Button } from "@/components/ui/button"
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

type Mode = PeriodKind | "range"

const MODE_LABELS: Record<Mode, string> = {
  week: "Tuần",
  month: "Tháng",
  range: "Khoảng ngày",
}
const CHART_METRIC_LABELS: Record<"spend" | "revenue" | "roas", string> = {
  spend: "Chi phí",
  revenue: "Doanh thu",
  roas: "ROAS",
}
const BUCKET_LABELS: Record<Granularity, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
}

const money = (n: number, currency: string) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currency || "VND",
    maximumFractionDigits: 0,
  }).format(n)
const roas = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const pct = (p: number | null) =>
  p == null ? "—" : `${p > 0 ? "+" : ""}${Math.round(p * 1000) / 10}%`
const ARROW = { up: "▲", down: "▼", flat: "–" } as const

export function AdsOverviewView() {
  const [mode, setMode] = React.useState<Mode>("month")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [compare, setCompare] = React.useState(false)
  const [bucket, setBucket] = React.useState<Granularity>("day")
  const [focus, setFocus] = React.useState("")
  const [chartMetric, setChartMetric] = React.useState<
    "spend" | "revenue" | "roas"
  >("spend")

  const query: ReportQuery = React.useMemo(
    () =>
      mode === "range"
        ? { kind: "range", from, to }
        : { kind: mode, date },
    [mode, date, from, to]
  )
  const queryReady =
    mode === "range" ? Boolean(from && to && from <= to) : Boolean(date)
  const key = JSON.stringify({ query, compare, bucket, focus })

  const [state, setState] = React.useState<{
    key: string
    report: ProductReportResponse | null
    cmp: ComparisonResponse | null
    series: TimeseriesResponse | null
    error: string | null
  } | null>(null)

  React.useEffect(() => {
    if (!queryReady) return
    let cancelled = false
    Promise.all([
      getProductReport(query),
      compare && mode !== "range"
        ? getReportComparison(mode, date)
        : Promise.resolve(null),
      getReportTimeseries(query, bucket, focus || undefined),
    ])
      .then(([report, cmp, series]) => {
        if (!cancelled) setState({ key, report, cmp, series, error: null })
      })
      .catch((e) => {
        if (!cancelled)
          setState({
            key,
            report: null,
            cmp: null,
            series: null,
            error: e instanceof Error ? e.message : String(e),
          })
      })
    return () => {
      cancelled = true
    }
  }, [key, query, compare, mode, date, bucket, focus, queryReady])

  const fresh = state?.key === key ? state : null
  const report = fresh?.report ?? null
  const cmp = fresh?.cmp ?? null
  const series = fresh?.series ?? null
  const error = fresh?.error ?? null
  const loading = queryReady && !fresh

  async function exportCsv(format: "report" | "timeseries") {
    try {
      await downloadCsv(
        reportExportUrl(query, format, format === "timeseries" ? bucket : undefined)
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại")
    }
  }

  const noAccounts =
    report != null && report.freshness.accounts_total === 0

  return (
    <div className="flex flex-col gap-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue>{MODE_LABELS[mode]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Tuần</SelectItem>
            <SelectItem value="month">Tháng</SelectItem>
            <SelectItem value="range">Khoảng ngày</SelectItem>
          </SelectContent>
        </Select>

        {mode === "range" ? (
          <>
            <Input
              type="date"
              className="h-8 w-40"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              className="h-8 w-40"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </>
        ) : (
          <Input
            type="date"
            className="h-8 w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}

        {mode !== "range" && (
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={compare}
              onCheckedChange={(c) => setCompare(c === true)}
            />
            So sánh kỳ trước
          </label>
        )}

        <div className="ml-auto flex gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={!report}
            onClick={() => exportCsv("report")}
          >
            Xuất báo cáo
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={!series}
            onClick={() => exportCsv("timeseries")}
          >
            Xuất biểu đồ
          </Button>
          <Button size="xs" variant="ghost" render={<Link href="/reports/settings" />}>
            Cấu hình
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && <Skeleton className="h-64 rounded-lg" />}

      {noAccounts && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa kết nối tài khoản quảng cáo Meta nào.{" "}
          <Link href="/ad-accounts" className="underline">
            Kết nối tài khoản
          </Link>{" "}
          để bắt đầu xem báo cáo.
        </p>
      )}

      {report && !noAccounts && (
        <>
          {/* freshness line (task 4.5) */}
          <p className="text-xs text-muted-foreground">
            {report.freshness.data_through
              ? `Số liệu tính đến ${report.freshness.data_through}. `
              : "Chưa có số liệu đồng bộ. "}
            Đang gộp {report.freshness.accounts_merged}/
            {report.freshness.accounts_total} tài khoản.
            {report.freshness.accounts_delayed.length > 0 &&
              ` Trễ/lỗi: ${report.freshness.accounts_delayed
                .map((a) => a.name)
                .join(", ")}.`}
            {report.freshness.accounts_missing_rate.length > 0 &&
              ` Thiếu tỷ giá: ${report.freshness.accounts_missing_rate.join(", ")}.`}
          </p>

          {/* product blocks (task 5.2) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.products.map((p) => (
              <ProductBlock
                key={p.product_id}
                name={p.name}
                spend={p.spend}
                revenue={p.revenue}
                roasValue={p.roas}
                currency={report.reporting_currency}
                delta={cmp?.rows.find((r) => r.product_id === p.product_id)}
              />
            ))}
            <ProductBlock
              name="Tổng 3 sản phẩm"
              highlight
              spend={report.total.spend}
              revenue={report.total.revenue}
              roasValue={report.total.roas}
              currency={report.reporting_currency}
              delta={cmp?.rows.find((r) => r.product_id === null)}
            />
          </div>

          {/* unclassified row (task 4.2 / 5.2) */}
          {report.unclassified.campaign_count > 0 && (
            <div className="rounded-lg border border-dashed px-3 py-2 text-sm">
              <span className="font-medium">Chưa phân loại</span> ·{" "}
              {report.unclassified.campaign_count} campaign · chi phí{" "}
              {money(report.unclassified.spend, report.reporting_currency)} · doanh
              thu {money(report.unclassified.revenue, report.reporting_currency)}
            </div>
          )}

          {/* trend chart (task 5.3 / 5.4) */}
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Diễn biến</span>
              <Select
                value={chartMetric}
                onValueChange={(v) =>
                  v && setChartMetric(v as "spend" | "revenue" | "roas")
                }
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue>{CHART_METRIC_LABELS[chartMetric]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spend">Chi phí</SelectItem>
                  <SelectItem value="revenue">Doanh thu</SelectItem>
                  <SelectItem value="roas">ROAS</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={bucket}
                onValueChange={(v) => v && setBucket(v as Granularity)}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue>{BUCKET_LABELS[bucket]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Ngày</SelectItem>
                  <SelectItem value="week">Tuần</SelectItem>
                  <SelectItem value="month">Tháng</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={focus || "all"}
                onValueChange={(v) => setFocus(!v || v === "all" ? "" : v)}
              >
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue>
                    {focus
                      ? (report.products.find((p) => p.product_id === focus)?.name ??
                        focus)
                      : "Cả 3 sản phẩm"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cả 3 sản phẩm</SelectItem>
                  {report.products.map((p) => (
                    <SelectItem key={p.product_id} value={p.product_id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {series && (
              <ReportTrendChart data={series} focus={focus} metric={chartMetric} />
            )}
          </div>

          {/* comparison table (task 5.2) */}
          {compare && cmp && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Δ Chi phí</TableHead>
                    <TableHead>Δ Doanh thu</TableHead>
                    <TableHead>Δ ROAS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cmp.rows.map((r) => (
                    <TableRow key={r.product_id ?? "__total__"}>
                      <TableCell>{r.name}</TableCell>
                      {(["spend", "revenue", "roas"] as const).map((m) => {
                        const d = r.deltas[m]
                        return (
                          <TableCell
                            key={m}
                            className={
                              d.direction === "up"
                                ? "text-emerald-600"
                                : d.direction === "down"
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                            }
                          >
                            {ARROW[d.direction]} {pct(d.pct)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProductBlock({
  name,
  spend,
  revenue,
  roasValue,
  currency,
  highlight,
  delta,
}: {
  name: string
  spend: number
  revenue: number
  roasValue: number
  currency: string
  highlight?: boolean
  delta?: { deltas: Record<"spend" | "revenue" | "roas", { pct: number | null; direction: "up" | "down" | "flat" }> }
}) {
  const line = (label: string, value: string, m?: "spend" | "revenue" | "roas") => {
    const d = m ? delta?.deltas[m] : undefined
    return (
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-medium tabular-nums">
          {value}
          {d && (
            <span
              className={
                d.direction === "up"
                  ? " text-emerald-600"
                  : d.direction === "down"
                    ? " text-destructive"
                    : " text-muted-foreground"
              }
            >
              {" "}
              {ARROW[d.direction]} {pct(d.pct)}
            </span>
          )}
        </span>
      </div>
    )
  }
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-3 ${
        highlight ? "bg-muted/40" : ""
      }`}
    >
      <p className="text-sm font-semibold">{name}</p>
      {line("Chi phí", money(spend, currency), "spend")}
      {line("Doanh thu", money(revenue, currency), "revenue")}
      {line("ROAS", roas(roasValue), "roas")}
    </div>
  )
}
