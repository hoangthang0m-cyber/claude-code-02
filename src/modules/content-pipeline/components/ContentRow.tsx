"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABELS,
  type ContentFieldUpdate,
} from "@/lib/domain"
import {
  assignContent,
  setEvaluation,
  updateContentFields,
  type ContentListRow,
} from "@/modules/content-pipeline/services/content.client"
import { AdsReportCell } from "@/modules/ads-performance/components/AdsReportCell"
import { ContentStatusBadge } from "@/modules/content-pipeline/components/ContentStatusBadge"
import { OverdueBadge } from "@/modules/content-pipeline/components/OverdueBadge"
import { ReferenceLinksCell } from "@/modules/reference-links/components/ReferenceLinksCell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { TableCell, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/utils/cn"

type Member = { user_id: string; name: string }

function secondsOf(v: unknown): number | null {
  if (v && typeof v === "object") {
    const o = v as { _seconds?: number; seconds?: number }
    return o._seconds ?? o.seconds ?? null
  }
  return null
}

function toDateInput(v: unknown): string {
  const s = secondsOf(v)
  return s == null ? "" : new Date(s * 1000).toISOString().slice(0, 10)
}

export function ContentRow({
  item,
  members,
  editable,
  canEvaluate,
  onChanged,
}: {
  item: ContentListRow
  members: Member[]
  editable: boolean
  /** SPEC §5.4 R5: the evaluation note is manager-only. */
  canEvaluate: boolean
  onChanged: () => void
}) {
  const router = useRouter()

  // ads-overview-reporting task 6.2: accumulate videos into a comparison basket
  // (localStorage), hard-capped at 6, then open the comparison page.
  function openComparison() {
    const KEY = "aor:vc:basket"
    let ids: string[] = []
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]")
      if (Array.isArray(raw)) ids = raw.filter((x): x is string => typeof x === "string")
    } catch {
      /* ignore */
    }
    if (!ids.includes(item.id)) {
      if (ids.length >= 6) {
        toast.error("Tối đa 6 video trong một bảng so sánh — bỏ bớt trước")
        return
      }
      ids = [...ids, item.id]
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(ids))
    } catch {
      /* ignore */
    }
    router.push(`/reports/video-comparison?items=${ids.join(",")}`)
  }

  async function patch(field: keyof ContentFieldUpdate, value: string | null) {
    try {
      await updateContentFields(item.id, { [field]: value })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được")
    }
  }

  async function saveEvaluation(value: string | null) {
    try {
      await setEvaluation(item.id, value)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được đánh giá")
    }
  }

  async function setAssignee(uid: string) {
    try {
      await assignContent(item.id, uid === "none" ? null : uid)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không gán được")
    }
  }

  return (
    <TableRow id={`item-${item.id}`} className="scroll-mt-20 target:bg-primary/10">
      <TableCell className="font-medium">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{item.code}</span>
          <OverdueBadge overdue={item.is_overdue} />
        </div>
      </TableCell>

      <TableCell
        className={cn(
          "min-w-36",
          item.is_overdue && "bg-destructive/10 text-destructive"
        )}
      >
        <Input
          type="date"
          disabled={!editable}
          className="h-7 bg-transparent"
          defaultValue={toDateInput(item.deadline)}
          onChange={(e) =>
            patch(
              "deadline",
              e.target.value ? new Date(e.target.value).toISOString() : null
            )
          }
        />
      </TableCell>

      <TableCell className="min-w-36">
        <Select
          value={item.assignee_id ?? "none"}
          onValueChange={(v) => v && setAssignee(v)}
          disabled={!editable}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {members.find((m) => m.user_id === item.assignee_id)?.name ??
                "Chưa gán"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Chưa gán</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <UrlCell
        value={item.script_url}
        editable={editable}
        label="Kịch bản"
        onSave={(v) => patch("script_url", v)}
      />
      <UrlCell
        value={item.video_url}
        editable={editable}
        label="Video"
        onSave={(v) => patch("video_url", v)}
      />

      <TableCell>
        <ContentStatusBadge status={item.status} />
      </TableCell>

      <TextCell
        value={item.topic}
        editable={editable}
        onSave={(v) => patch("topic", v)}
      />

      <TableCell className="min-w-28">
        <Select
          value={item.content_format ?? "none"}
          onValueChange={(v) =>
            v && patch("content_format", v === "none" ? null : v)
          }
          disabled={!editable}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {item.content_format
                ? CONTENT_FORMAT_LABELS[
                    item.content_format as keyof typeof CONTENT_FORMAT_LABELS
                  ]
                : "—"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {CONTENT_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {CONTENT_FORMAT_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <UrlCell
        value={item.customer_research_url}
        editable={editable}
        label="Research"
        onSave={(v) => patch("customer_research_url", v)}
      />

      {/* Ads report — Meta figure (read-only) + hand-typed note beside it
          (campaign-page-reference-links task 6.1 / 6.3) */}
      <TableCell className="min-w-44 align-top">
        <div className="flex flex-col gap-1">
          <AdsReportCell metric={item.ads_metric} />
          {canEvaluate && item.has_ads_binding === true && (
            <button
              type="button"
              onClick={openComparison}
              className="inline-block self-start text-xs text-primary hover:underline"
            >
              Xem hiệu quả
            </button>
          )}
          <AdsNoteEditor
            value={item.ads_report_note as string | undefined}
            editable={canEvaluate}
            onSave={(v) => patch("ads_report_note", v)}
          />
        </div>
      </TableCell>

      {/* Evaluation — manager-only free-text note (SPEC §5.4 R5). Opens a wide
          scrollable panel so a long write-up is not cramped into one line. */}
      <LongTextCell
        value={item.evaluation as string | undefined}
        editable={canEvaluate}
        title={`Đánh giá / đề xuất — ${item.code}`}
        placeholder="Đánh giá / đề xuất cho hạng mục này…"
        onSave={saveEvaluation}
      />

      {/* Tài liệu — reference links (campaign-page-reference-links task 4.4) */}
      <TableCell className="align-top">
        <ReferenceLinksCell
          contentItemId={item.id}
          code={item.code}
          count={
            typeof item.reference_link_count === "number"
              ? item.reference_link_count
              : 0
          }
        />
      </TableCell>
    </TableRow>
  )
}

// campaign-page-reference-links task 6.3: a free-text ads note, hand-typed,
// shown next to (never merged into) the Meta figure.
function AdsNoteEditor({
  value,
  editable,
  onSave,
}: {
  value?: string
  editable: boolean
  onSave: (v: string | null) => void
}) {
  const [v, setV] = React.useState(value ?? "")
  if (!editable && !value) return null
  return (
    <textarea
      className="min-h-8 w-full resize-y rounded border bg-transparent px-1.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70"
      disabled={!editable}
      placeholder="Ghi chú ads (nhập tay)"
      rows={2}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim()
        if (t !== (value ?? "")) onSave(t || null)
      }}
    />
  )
}

// A cell for a long free-text field (e.g. the evaluation). The cell itself shows
// a clamped preview; clicking opens a wide side panel with a tall, scrollable
// textarea so a multi-paragraph write-up has room. Read-only viewers can still
// open it to read the full text when there is any.
function LongTextCell({
  value,
  editable,
  title,
  placeholder,
  onSave,
}: {
  value?: string
  editable: boolean
  title: string
  placeholder?: string
  onSave: (v: string | null) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [v, setV] = React.useState(value ?? "")

  const canOpen = editable || !!value

  return (
    <TableCell className="min-w-44 max-w-64 align-top">
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) setV(value ?? "")
          setOpen(next && canOpen)
        }}
      >
        <SheetTrigger
          render={
            <button
              type="button"
              disabled={!canOpen}
              className={cn(
                "w-full rounded border bg-transparent px-1.5 py-1 text-left text-xs",
                canOpen ? "hover:bg-muted" : "cursor-default opacity-70"
              )}
            >
              {value ? (
                <span className="line-clamp-4 whitespace-pre-wrap">{value}</span>
              ) : (
                <span className="text-muted-foreground">
                  {editable ? (placeholder ?? "Bấm để nhập") : "—"}
                </span>
              )}
            </button>
          }
        />
        <SheetContent className="flex w-full flex-col sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
            <Textarea
              autoFocus={editable}
              readOnly={!editable}
              className="min-h-[55vh] max-h-[70vh] w-full flex-1 resize-y text-sm"
              placeholder={placeholder}
              value={v}
              onChange={(e) => setV(e.target.value)}
            />
          </div>
          {editable && (
            <SheetFooter>
              <Button
                onClick={() => {
                  const trimmed = v.trim()
                  if (trimmed !== (value ?? "")) onSave(trimmed || null)
                  setOpen(false)
                }}
              >
                Lưu
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
    </TableCell>
  )
}

function TextCell({
  value,
  editable,
  placeholder,
  onSave,
}: {
  value?: string
  editable: boolean
  placeholder?: string
  onSave: (v: string | null) => void
}) {
  const [v, setV] = React.useState(value ?? "")
  return (
    <TableCell className="min-w-36">
      <Input
        className="h-7"
        disabled={!editable}
        placeholder={placeholder}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const trimmed = v.trim()
          if (trimmed !== (value ?? "")) onSave(trimmed || null)
        }}
      />
    </TableCell>
  )
}

function UrlCell({
  value,
  editable,
  label,
  onSave,
}: {
  value?: string
  editable: boolean
  label: string
  onSave: (v: string | null) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [v, setV] = React.useState(value ?? "")

  if (!editing) {
    return (
      <TableCell className="min-w-32">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {label} ↗
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {editable && (
          <button
            type="button"
            className="ml-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setV(value ?? "")
              setEditing(true)
            }}
          >
            sửa
          </button>
        )}
      </TableCell>
    )
  }

  return (
    <TableCell className="min-w-40">
      <Input
        className="h-7"
        autoFocus
        type="url"
        placeholder="https://..."
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const trimmed = v.trim()
          if (trimmed !== (value ?? "")) onSave(trimmed || null)
        }}
      />
    </TableCell>
  )
}
