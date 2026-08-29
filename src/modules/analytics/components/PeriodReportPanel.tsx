"use client"

import * as React from "react"
import { toast } from "sonner"

import { COMPARED_METRICS, COMPARED_METRIC_LABELS } from "@/lib/domain"
import {
  downloadCsv,
  getComparison,
  getReport,
  type ComparisonResult,
  type ReportKind,
  type ReportResult,
} from "@/modules/analytics/services/analytics.client"
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

const num = (n: number) => Math.round(n * 100) / 100
const pct = (p: number | null) =>
  p == null ? "—" : `${p > 0 ? "+" : ""}${Math.round(p * 1000) / 10}%`
const ARROW = { up: "▲", down: "▼", flat: "–" } as const

// SPEC §5.6 R3 / R4, task 8.6: the weekly/monthly report with a comparison
// toggle and CSV export.
export function PeriodReportPanel() {
  const [kind, setKind] = React.useState<ReportKind>("month")
  const [date, setDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [compare, setCompare] = React.useState(false)

  const [result, setResult] = React.useState<{
    key: string
    report: ReportResult | null
    cmp: ComparisonResult | null
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const key = `${kind}|${date}|${compare}`

  React.useEffect(() => {
    let cancelled = false
    const done = compare
      ? getComparison(kind, date).then(
          (r) => !cancelled && setResult({ key, report: null, cmp: r })
        )
      : getReport(kind, date).then(
          (r) => !cancelled && setResult({ key, report: r, cmp: null })
        )
    done.catch(
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e))
    )
    return () => {
      cancelled = true
    }
  }, [key, kind, date, compare])

  const fresh = result?.key === key ? result : null
  const report = fresh?.report ?? null
  const cmp = fresh?.cmp ?? null

  async function exportCsv() {
    try {
      await downloadCsv(
        `/api/dashboard/report?period=${kind}&date=${date}${
          compare ? "&compare=1" : ""
        }&format=csv`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại")
    }
  }

  const current = compare ? cmp?.current : report
  const loading = compare ? cmp === null : report === null

  return (
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : current && !current.has_data ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa có dữ liệu trong kỳ.
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
                const d = cmp?.deltas[m]
                return (
                  <TableRow key={m}>
                    <TableCell>{COMPARED_METRIC_LABELS[m]}</TableCell>
                    <TableCell>{num(current?.[m] ?? 0)}</TableCell>
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
                        {d ? `${ARROW[d.direction]} ${num(d.abs)} (${pct(d.pct)})` : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {current?.has_data && current.top_by_roas.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Top hạng mục theo ROAS
          </p>
          <ul className="text-sm">
            {current.top_by_roas.map((t) => (
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
  )
}
