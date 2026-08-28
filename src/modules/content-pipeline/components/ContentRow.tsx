"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABELS,
  type ContentFieldUpdate,
} from "@/lib/domain"
import {
  assignContent,
  updateContentFields,
  type ContentListRow,
} from "@/modules/content-pipeline/services/content.client"
import { ContentStatusBadge } from "@/modules/content-pipeline/components/ContentStatusBadge"
import { OverdueBadge } from "@/modules/content-pipeline/components/OverdueBadge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
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
  onChanged,
}: {
  item: ContentListRow
  members: Member[]
  editable: boolean
  onChanged: () => void
}) {
  async function patch(field: keyof ContentFieldUpdate, value: string | null) {
    try {
      await updateContentFields(item.id, { [field]: value })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được")
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
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
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

      {/* Ads report — derived from AdsMetric, read-only here (SPEC §5.4) */}
      <TableCell className="min-w-40 text-xs text-muted-foreground">
        Chưa có dữ liệu ads
      </TableCell>

      {/* Evaluation — manager-only write (SPEC §5.4 R5 / task 5.9), read-only here */}
      <TableCell className="min-w-40 text-xs whitespace-normal text-muted-foreground">
        {(item.evaluation as string) || "—"}
      </TableCell>
    </TableRow>
  )
}

function TextCell({
  value,
  editable,
  onSave,
}: {
  value?: string
  editable: boolean
  onSave: (v: string | null) => void
}) {
  const [v, setV] = React.useState(value ?? "")
  return (
    <TableCell className="min-w-36">
      <Input
        className="h-7"
        disabled={!editable}
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
