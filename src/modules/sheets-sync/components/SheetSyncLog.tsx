"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  getSheetSyncLog,
  setSheetSyncEnabled,
  type SheetSyncLog as SheetSyncLogData,
  type SyncRunView,
} from "@/modules/sheets-sync/services/google.client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// SPEC §5.5 R3 / R4, tasks 6.8 / 6.9: per-project sync status + log — last sync
// time, result, rows read/written, the recent conflict list, and the on/off
// switch (6.9) with its paused-reason banner.

const RESULT_META: Record<
  string,
  { label: string; variant: "secondary" | "outline" | "destructive" }
> = {
  ok: { label: "Thành công", variant: "secondary" },
  warning: { label: "Có cảnh báo", variant: "outline" },
  error: { label: "Lỗi", variant: "destructive" },
}

function fmt(ms: number | null): string {
  return ms == null ? "—" : new Date(ms).toLocaleString("vi-VN")
}

function ResultBadge({ result }: { result: SyncRunView["result"] }) {
  const meta = (result && RESULT_META[result]) || {
    label: "Đang chạy",
    variant: "outline" as const,
  }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export function SheetSyncLog({
  projectId,
  refreshSignal,
  canToggle = false,
}: {
  projectId: string
  /** bump to refetch after a manual "đồng bộ ngay" */
  refreshSignal?: number
  /** show the on/off switch — the viewer is a project manager */
  canToggle?: boolean
}) {
  const [data, setData] = React.useState<SheetSyncLogData | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [localSignal, setLocalSignal] = React.useState(0)
  const [toggling, setToggling] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    getSheetSyncLog(projectId)
      .then((r) => {
        if (!cancelled) {
          setData(r)
          setError(null)
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Không tải được nhật ký")
      })
    return () => {
      cancelled = true
    }
  }, [projectId, refreshSignal, localSignal])

  async function toggle(enabled: boolean) {
    setToggling(true)
    try {
      await setSheetSyncEnabled(projectId, enabled)
      toast.success(enabled ? "Đã bật lại đồng bộ" : "Đã tạm dừng đồng bộ")
      setLocalSignal((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đổi được trạng thái")
    } finally {
      setToggling(false)
    }
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>
  }
  if (!data || !data.configured) return null

  const { last_run, runs, conflicts, sync_enabled, sync_disabled_reason } = data

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Trạng thái đồng bộ</span>
        {sync_enabled ? (
          <Badge variant="secondary">Đang bật</Badge>
        ) : (
          <Badge variant="destructive">Đã tạm dừng</Badge>
        )}
        {canToggle && (
          <Button
            size="sm"
            variant="outline"
            disabled={toggling}
            onClick={() => toggle(!sync_enabled)}
          >
            {sync_enabled ? "Tạm dừng đồng bộ" : "Bật lại đồng bộ"}
          </Button>
        )}
      </div>

      {!sync_enabled && (
        <p className="text-xs text-muted-foreground">
          {sync_disabled_reason === "permission_lost"
            ? "Hệ thống mất quyền đọc/ghi Google Sheet nên đã tự tạm dừng. Cấp lại quyền cho sheet rồi bấm “Bật lại đồng bộ”."
            : "Đồng bộ nền đang tắt. Dữ liệu hai bên được giữ nguyên; bật lại bất cứ lúc nào."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Lần gần nhất:</span>
        {last_run ? (
          <>
            <ResultBadge result={last_run.result} />
            <span>
              {fmt(last_run.finished_at ?? last_run.started_at)} ·{" "}
              {last_run.rows_read} đọc / {last_run.rows_written} ghi
            </span>
          </>
        ) : (
          <span>Chưa đồng bộ lần nào</span>
        )}
      </div>

      {runs.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Nhật ký gần đây
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">Thời điểm</th>
                  <th className="py-1 pr-3 font-normal">Kết quả</th>
                  <th className="py-1 pr-3 font-normal">Đọc</th>
                  <th className="py-1 pr-3 font-normal">Ghi</th>
                  <th className="py-1 font-normal">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {fmt(r.finished_at ?? r.started_at)}
                    </td>
                    <td className="py-1 pr-3">
                      <ResultBadge result={r.result} />
                    </td>
                    <td className="py-1 pr-3">{r.rows_read}</td>
                    <td className="py-1 pr-3">{r.rows_written}</td>
                    <td className="py-1 text-muted-foreground">{r.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Xung đột gần đây ({conflicts.length})
          </p>
          <ul className="flex flex-col gap-1 text-xs">
            {conflicts.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{c.field}</span> ·
                hệ thống <span className="font-mono">{c.system_value || "∅"}</span>{" "}
                ↔ sheet <span className="font-mono">{c.sheet_value || "∅"}</span> ·
                giữ{" "}
                <span className="text-foreground">
                  {c.chosen_side === "sheet" ? "sheet" : "hệ thống"}
                </span>{" "}
                · {fmt(c.created_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
