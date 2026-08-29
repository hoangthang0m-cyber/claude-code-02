"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentStatus,
} from "@/lib/domain"
import {
  downloadCsv,
  getPeople,
  getPersonItems,
  type PeopleResult,
  type PersonItem,
  type PersonRow,
} from "@/modules/analytics/services/analytics.client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function days(ms: number | null): string {
  return ms == null ? "—" : `${Math.round((ms / 86_400_000) * 10) / 10} ngày`
}

// SPEC §5.6 R2, task 8.6: the per-person workload table; clicking a row opens
// that person's content items with a status filter.
export function PeopleSection() {
  const [data, setData] = React.useState<PeopleResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<PersonRow | null>(null)

  React.useEffect(() => {
    let cancelled = false
    getPeople()
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [])

  async function exportCsv() {
    try {
      await downloadCsv("/api/dashboard/people?format=csv")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Xuất thất bại")
    }
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Theo nhân sự</h3>
        <Button size="xs" variant="outline" onClick={exportCsv} disabled={!data}>
          Xuất CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Nhân sự</TableHead>
              <TableHead>Đang thực hiện</TableHead>
              <TableHead>Hoàn tất trong kỳ</TableHead>
              <TableHead>Quá hạn</TableHead>
              <TableHead>TB nhận→duyệt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ) : data.people.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-14 text-center text-sm text-muted-foreground"
                >
                  Chưa có nhân sự trong phạm vi.
                </TableCell>
              </TableRow>
            ) : (
              data.people.map((p) => (
                <TableRow
                  key={p.user_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelected(p)}
                >
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.has_overdue && (
                        <Badge variant="destructive">có quá hạn</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{p.in_progress}</TableCell>
                  <TableCell>{p.completed_in_period}</TableCell>
                  <TableCell
                    className={p.overdue > 0 ? "text-destructive" : undefined}
                  >
                    {p.overdue}
                  </TableCell>
                  <TableCell>{days(p.avg_lead_time_ms)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PersonItemsSheet
        person={selected}
        onClose={() => setSelected(null)}
      />
    </section>
  )
}

function PersonItemsSheet({
  person,
  onClose,
}: {
  person: PersonRow | null
  onClose: () => void
}) {
  const [status, setStatus] = React.useState<string>("all")
  const [result, setResult] = React.useState<{
    key: string
    items: PersonItem[]
  } | null>(null)

  const key = `${person?.user_id ?? ""}|${status}`

  React.useEffect(() => {
    if (!person) return
    let cancelled = false
    getPersonItems(person.user_id, status === "all" ? undefined : status)
      .then((r) => !cancelled && setResult({ key, items: r.items }))
      .catch(() => !cancelled && setResult({ key, items: [] }))
    return () => {
      cancelled = true
    }
  }, [key, person, status])

  // null while the fetch for the current key is still in flight
  const items = result?.key === key ? result.items : null

  return (
    <Sheet open={person != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Hạng mục của {person?.name}</SheetTitle>
        </SheetHeader>

        <Select value={status} onValueChange={(v) => v && setStatus(v)}>
          <SelectTrigger size="sm" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            {CONTENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTENT_STATUS_LABELS[s as ContentStatus]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1 overflow-y-auto">
          {items === null ? (
            <Skeleton className="h-20 w-full" />
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Không có hạng mục.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{it.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {CONTENT_STATUS_LABELS[it.status]}
                    </span>
                  </span>
                  {it.is_overdue && (
                    <Badge variant="destructive">Quá hạn</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
