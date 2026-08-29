"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  SHEET_ADS_FIELDS,
  SHEET_ADS_FIELD_LABELS,
  SHEET_INBOUND_FIELDS,
  SHEET_INBOUND_FIELD_LABELS,
} from "@/lib/domain"
import {
  getSheetMapping,
  previewSheet,
  saveSheetMapping,
  syncSheetNow,
  type SheetPreview,
} from "@/modules/sheets-sync/services/google.client"
import { SheetSyncLog } from "@/modules/sheets-sync/components/SheetSyncLog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const NONE = "__none__"

// SPEC §5.5 R1, task 6.2: manager configures the SheetSyncMapping — sheet URL,
// header row, column→field map, conflict rule — then saves + runs the first sync.
export function SheetSyncPanel({ projectId }: { projectId: string }) {
  const [url, setUrl] = React.useState("")
  const [headerRow, setHeaderRow] = React.useState(1)
  const [conflictRule, setConflictRule] = React.useState<
    "system_wins" | "sheet_wins"
  >("system_wins")
  const [columnMap, setColumnMap] = React.useState<Record<string, string>>({})
  const [preview, setPreview] = React.useState<SheetPreview | null>(null)
  const [checking, setChecking] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [hasMapping, setHasMapping] = React.useState(false)
  const [logSignal, setLogSignal] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    getSheetMapping(projectId)
      .then((r) => {
        if (cancelled || !r.mapping) return
        setHasMapping(true)
        setUrl(r.mapping.progress_sheet_url ?? "")
        setHeaderRow(r.mapping.header_row)
        setConflictRule(
          r.mapping.conflict_rule === "sheet_wins" ? "sheet_wins" : "system_wins"
        )
        setColumnMap(r.mapping.column_map)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function check() {
    setChecking(true)
    try {
      const p = await previewSheet(projectId, url, headerRow)
      setPreview(p)
      if (!p.can_write) toast.warning("Bạn chỉ có quyền đọc sheet này")
    } catch (e) {
      setPreview(null)
      toast.error(e instanceof Error ? e.message : "Không kiểm tra được")
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    if (!columnMap.code) {
      toast.error('Phải ánh xạ cột "Mã hạng mục"')
      return
    }
    setSaving(true)
    try {
      const cleanMap = Object.fromEntries(
        Object.entries(columnMap).filter(([, v]) => v && v !== NONE)
      )
      const { first_sync, sheet_tab } = await saveSheetMapping(projectId, {
        url,
        header_row: headerRow,
        column_map: cleanMap,
        conflict_rule: conflictRule,
      })
      setHasMapping(true)
      setLogSignal((n) => n + 1)
      toast.success(
        `Đã lưu (tab "${sheet_tab}"). Đồng bộ lần đầu: ${first_sync.created} tạo mới, ` +
          `${first_sync.updated} cập nhật` +
          (first_sync.mapping_errors
            ? `, ${first_sync.mapping_errors} dòng lỗi ánh xạ`
            : "")
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được")
    } finally {
      setSaving(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    try {
      const { pull, push } = await syncSheetNow(projectId)
      setLogSignal((n) => n + 1)
      toast.success(
        `Sheet→hệ thống: ${pull.created} tạo, ${pull.updated} cập nhật` +
          (pull.mapping_errors ? `, ${pull.mapping_errors} lỗi ánh xạ` : "") +
          `. Hệ thống→sheet: ${push.cells_written} ô.`
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đồng bộ được")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold">Đồng bộ Google Sheets</h2>
        <p className="text-xs text-muted-foreground">
          Gắn sheet tiến độ, ánh xạ cột, rồi lưu để đồng bộ lần đầu (SPEC §5.5).
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sheet-url">Link Google Sheet</Label>
        <div className="flex gap-2">
          <Input
            id="sheet-url"
            className="h-8"
            placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={check}
            disabled={checking || !url.trim()}
          >
            Kiểm tra
          </Button>
        </div>
        {preview && (
          <p className="text-xs text-muted-foreground">
            Tab <span className="font-medium">{preview.sheet_tab}</span> ·{" "}
            {preview.can_write ? "đọc + ghi được" : "chỉ đọc được"} ·{" "}
            {preview.header_columns.length} cột
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="header-row" className="text-sm">
          Dòng tiêu đề
        </Label>
        <Input
          id="header-row"
          type="number"
          min={1}
          className="h-8 w-20"
          value={headerRow}
          onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      {preview && preview.header_columns.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Ánh xạ cột → trường (2 chiều)</p>
            <MapGrid
              fields={SHEET_INBOUND_FIELDS}
              labels={SHEET_INBOUND_FIELD_LABELS}
              columns={preview.header_columns}
              columnMap={columnMap}
              onChange={(f, v) => setColumnMap((m) => ({ ...m, [f]: v }))}
              requiredField="code"
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Cột số liệu ads{" "}
              <span className="font-normal text-muted-foreground">
                (chỉ ghi xuống sheet, không đọc ngược)
              </span>
            </p>
            <MapGrid
              fields={SHEET_ADS_FIELDS}
              labels={SHEET_ADS_FIELD_LABELS}
              columns={preview.header_columns}
              columnMap={columnMap}
              onChange={(f, v) => setColumnMap((m) => ({ ...m, [f]: v }))}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Khi xung đột:</span>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={conflictRule === "system_wins"}
            onChange={() => setConflictRule("system_wins")}
          />
          Hệ thống thắng
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={conflictRule === "sheet_wins"}
            onChange={() => setConflictRule("sheet_wins")}
          />
          Sheet thắng
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={saving || !preview || !columnMap.code}
        >
          Lưu & đồng bộ lần đầu
        </Button>
        {hasMapping && (
          <Button
            size="sm"
            variant="outline"
            onClick={syncNow}
            disabled={syncing}
          >
            Đồng bộ ngay
          </Button>
        )}
      </div>

      {hasMapping && (
        <SheetSyncLog
          projectId={projectId}
          refreshSignal={logSignal}
          canToggle
        />
      )}
    </section>
  )
}

function MapGrid({
  fields,
  labels,
  columns,
  columnMap,
  onChange,
  requiredField,
}: {
  fields: readonly string[]
  labels: Record<string, string>
  columns: string[]
  columnMap: Record<string, string>
  onChange: (field: string, value: string) => void
  requiredField?: string
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field} className="flex items-center gap-2 text-sm">
          <span className="w-36 shrink-0 text-muted-foreground">
            {labels[field]}
            {field === requiredField && " *"}
          </span>
          <Select
            value={columnMap[field] || NONE}
            onValueChange={(v) => v && onChange(field, v)}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— không ánh xạ —</SelectItem>
              {columns.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
