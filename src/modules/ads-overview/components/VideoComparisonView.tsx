"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"

import { downloadCsv } from "@/modules/analytics/services/analytics.client"
import {
  getVideoComparison,
  videoComparisonExportUrl,
  VIDEO_COMPARISON_LIMIT,
  VIDEO_CORE_METRICS,
  VIDEO_EXTRA_METRICS,
  VIDEO_METRIC_LABELS,
  type Granularity,
  type PeriodKind,
  type ReportQuery,
  type VideoComparisonResponse,
} from "@/modules/ads-overview/services/adsReporting.client"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
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

const METRICS_KEY = "aor:vc:metrics"
const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
]

type Mode = PeriodKind | "range"

function fmt(metric: string, v: number | null): string {
  if (v == null) return "—"
  if (metric === "hook_rate" || metric === "retention_rate" || metric === "ctr") {
    return `${Math.round(v * 1000) / 10}%`
  }
  if (metric === "roas") return (Math.round(v * 100) / 100).toFixed(2)
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(v)
}

// remembered extra-metric selection (task 6.4), via useSyncExternalStore so it
// survives SSR without a hydration mismatch.
function useStoredMetrics(): [string[], (m: string) => void] {
  const subscribe = React.useCallback((cb: () => void) => {
    window.addEventListener("aor-vc-metrics", cb)
    return () => window.removeEventListener("aor-vc-metrics", cb)
  }, [])
  const getSnapshot = React.useCallback(() => {
    try {
      return localStorage.getItem(METRICS_KEY) ?? "[]"
    } catch {
      return "[]"
    }
  }, [])
  const raw = React.useSyncExternalStore(subscribe, getSnapshot, () => "[]")
  const extras = React.useMemo(() => {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v)
        ? v.filter((m) => (VIDEO_EXTRA_METRICS as readonly string[]).includes(m))
        : []
    } catch {
      return []
    }
  }, [raw])
  const toggle = React.useCallback(
    (m: string) => {
      const next = extras.includes(m)
        ? extras.filter((x) => x !== m)
        : [...extras, m]
      try {
        localStorage.setItem(METRICS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("aor-vc-metrics"))
    },
    [extras]
  )
  return [extras, toggle]
}

export function VideoComparisonView() {
  const router = useRouter()
  const search = useSearchParams()
  const items = React.useMemo(
    () =>
      (search.get("items") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [search]
  )

  const [mode, setMode] = React.useState<Mode>("month")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [extras, toggleExtra] = useStoredMetrics()
  const [chartMetric, setChartMetric] = React.useState<string>("hook_rate")
  const [bucket, setBucket] = React.useState<Granularity>("day")

  const query: ReportQuery = React.useMemo(
    () => (mode === "range" ? { kind: "range", from, to } : { kind: mode, date }),
    [mode, date, from, to]
  )
  const queryReady =
    items.length > 0 &&
    (mode === "range" ? Boolean(from && to && from <= to) : Boolean(date))
  const key = JSON.stringify({ items, query, extras, chartMetric, bucket })

  const [state, setState] = React.useState<{
    key: string
    data: VideoComparisonResponse | null
    error: string | null
  } | null>(null)

  React.useEffect(() => {
    if (!queryReady) return
    let cancelled = false
    getVideoComparison({
      items,
      query,
      extras,
      bucket,
      seriesMetric: chartMetric,
    })
      .then((data) => !cancelled && setState({ key, data, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setState({
            key,
            data: null,
            error: e instanceof Error ? e.message : String(e),
          })
      )
    return () => {
      cancelled = true
    }
  }, [key, queryReady, items, query, extras, bucket, chartMetric])

  const fresh = state?.key === key ? state : null
  const data = fresh?.data ?? null
  const error = fresh?.error ?? null

  function removeItem(id: string) {
    const next = items.filter((x) => x !== id)
    router.replace(
      next.length ? `/reports/video-comparison?items=${next.join(",")}` : "/reports/video-comparison"
    )
  }

  async function exportCsv() {
    try {
      await downloadCsv(videoComparisonExportUrl({ items, query, extras }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại")
    }
  }

  const shownMetrics = [...VIDEO_CORE_METRICS, ...extras]

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Chưa chọn video nào. Mở trang Chiến dịch và bấm “Xem hiệu quả” trên một
        hạng mục đã gắn ad.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={mode} onValueChange={(v) => v && setMode(v as Mode)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Tuần</SelectItem>
            <SelectItem value="month">Tháng</SelectItem>
            <SelectItem value="range">Khoảng ngày</SelectItem>
          </SelectContent>
        </Select>
        {mode === "range" ? (
          <>
            <Input type="date" className="h-8 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-muted-foreground">→</span>
            <Input type="date" className="h-8 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        ) : (
          <Input type="date" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
        )}
        <Button size="xs" variant="outline" className="ml-auto" disabled={!data} onClick={exportCsv}>
          Xuất CSV
        </Button>
      </div>

      {/* metric picker (task 6.4) */}
      <div className="flex flex-wrap gap-3 text-sm">
        {VIDEO_CORE_METRICS.map((m) => (
          <span key={m} className="rounded bg-muted px-2 py-0.5 text-xs">
            {VIDEO_METRIC_LABELS[m]}
          </span>
        ))}
        {VIDEO_EXTRA_METRICS.map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={extras.includes(m)}
              onChange={() => toggleExtra(m)}
            />
            {VIDEO_METRIC_LABELS[m]}
          </label>
        ))}
      </div>

      {items.length > VIDEO_COMPARISON_LIMIT && (
        <p className="text-sm text-destructive">
          Tối đa {VIDEO_COMPARISON_LIMIT} video — bỏ bớt {items.length - VIDEO_COMPARISON_LIMIT} video.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {queryReady && !fresh && !error && <Skeleton className="h-48 rounded-lg" />}

      {data && (
        <>
          {data.accounts_missing_rate.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Thiếu tỷ giá: {data.accounts_missing_rate.join(", ")} — chi phí/doanh
              thu của các tài khoản này bị bỏ qua.
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead>Chỉ số</TableHead>
                  {data.items.map((it) => (
                    <TableHead key={it.content_item_id}>
                      <span className="flex items-center gap-1">
                        {it.code}
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeItem(it.content_item_id)}
                          aria-label={`Bỏ ${it.code}`}
                        >
                          ✕
                        </button>
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownMetrics.map((m) => (
                  <TableRow key={m}>
                    <TableCell className="font-medium">
                      {VIDEO_METRIC_LABELS[m] ?? m}
                    </TableCell>
                    {data.items.map((it) => (
                      <TableCell key={it.content_item_id} className="tabular-nums">
                        {it.status === "pending"
                          ? "đang lấy số liệu…"
                          : m === "reach"
                            ? fmt("reach", it.reach)
                            : fmt(m, it.metrics[m] ?? null)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* trend chart (task 6.6) */}
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Diễn biến</span>
              <Select value={chartMetric} onValueChange={(v) => v && setChartMetric(v)}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...VIDEO_CORE_METRICS, "ctr", "spend", "purchases", "impressions"].map(
                    (m) => (
                      <SelectItem key={m} value={m}>
                        {VIDEO_METRIC_LABELS[m] ?? m}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              <Select value={bucket} onValueChange={(v) => v && setBucket(v as Granularity)}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Ngày</SelectItem>
                  <SelectItem value="week">Tuần</SelectItem>
                  <SelectItem value="month">Tháng</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TrendChart data={data} />
          </div>
        </>
      )}
    </div>
  )
}

function TrendChart({ data }: { data: VideoComparisonResponse }) {
  const series = data.series
  if (!series || series.buckets.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Chưa có dữ liệu trong khoảng này
      </div>
    )
  }
  const rows = series.buckets.map((bucket, i) => {
    const row: Record<string, string | number | null> = { bucket }
    for (const line of series.lines) row[line.content_item_id] = line.values[i]
    return row
  })
  const config: ChartConfig = {}
  series.lines.forEach((line, i) => {
    config[line.content_item_id] = {
      label: line.code,
      color: LINE_COLORS[i % LINE_COLORS.length],
    }
  })
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <LineChart data={rows} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        {series.lines.map((line, i) => (
          <Line
            key={line.content_item_id}
            type="monotone"
            dataKey={line.content_item_id}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
