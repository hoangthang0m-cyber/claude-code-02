"use client"

import * as React from "react"
import { toast } from "sonner"

import { useAuth } from "@/context/AuthContext"
import { useIsMobile } from "@/hooks/useMobile"
import {
  CALENDAR_ITEM_TYPES,
  CALENDAR_ITEM_TYPE_LABELS,
  calendarItemDisplayTitle,
  resolvePrimaryAssignee,
  toVnInputDate,
  toVnInputDateTime,
  vnDateInputToMs,
  vnDateTimeInputToMs,
  vnDateKey,
  type CalendarItemType,
  type RecurrenceEditScope,
  type Reminder,
  type RenderableItem,
} from "@/lib/domain/calendar"
import { useMembers } from "@/modules/team-calendar/context/CalendarDataProvider"
import { usePermissions } from "@/modules/team-calendar/hooks/usePermissions"
import { useVisibleCalendars } from "@/modules/team-calendar/hooks/useVisibleCalendars"
import { useMyProjects } from "@/modules/project-workspace/hooks/useMyProjects"
import {
  createCalendarItem,
  updateCalendarItem,
} from "@/modules/team-calendar/services/calendarItems.client"
import { RemindersField } from "@/modules/team-calendar/components/RemindersField"
import { RecurrenceEditor } from "@/modules/team-calendar/components/RecurrenceEditor"
import { RecurrenceScopeDialog } from "@/modules/team-calendar/components/RecurrenceScopeDialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

const NONE = "__none__"
const DEFAULT_DURATION_MS = 60 * 60 * 1000

interface Draft {
  type: CalendarItemType
  title: string
  allDay: boolean
  start: string // date or datetime-local, giờ VN
  end: string
  calendarId: string
  assigneeIds: string[]
  primaryAssigneeId: string | null
  location: string
  description: string
  linkedProjectId: string | null
  reminders: Reminder[]
  recurrence: string | null
}

export interface ItemEditorSeed {
  calendarId?: string
  type?: CalendarItemType
  startMs?: number
  endMs?: number
  allDay?: boolean
}

function draftFromItem(item: RenderableItem): Draft {
  const dt = item.allDay ? toVnInputDate : toVnInputDateTime
  return {
    type: item.type,
    title: item.title,
    allDay: item.allDay,
    start: dt(item.startAt),
    end: item.allDay
      ? toVnInputDate(item.endAt.toMillis() - 1)
      : toVnInputDateTime(item.endAt),
    calendarId: item.calendarId,
    assigneeIds: item.assigneeIds,
    primaryAssigneeId: item.primaryAssigneeId,
    location: item.location ?? "",
    description: item.description ?? "",
    linkedProjectId: item.linkedProjectId,
    reminders: item.reminders,
    // editing a single occurrence never edits the rule itself
    recurrence: item.occurrence ? null : item.recurrence,
  }
}

function draftFromSeed(seed: ItemEditorSeed, calendarId: string): Draft {
  const allDay = seed.allDay ?? false
  const startMs = seed.startMs ?? Date.now()
  const endMs = seed.endMs ?? startMs + DEFAULT_DURATION_MS
  return {
    type: seed.type ?? "task",
    title: "",
    allDay,
    start: allDay ? toVnInputDate(startMs) : toVnInputDateTime(startMs),
    end: allDay ? toVnInputDate(endMs - 1) : toVnInputDateTime(endMs),
    calendarId: seed.calendarId ?? calendarId,
    assigneeIds: [],
    primaryAssigneeId: null,
    location: "",
    description: "",
    linkedProjectId: null,
    reminders: [],
    recurrence: null,
  }
}

// Full editor (Mục D task 5.2). Dialog on desktop, Sheet on mobile.
export function ItemEditorForm({
  open,
  onOpenChange,
  item,
  seed,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: RenderableItem
  seed?: ItemEditorSeed
  onSaved?: (id: string) => void
}) {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const { isManager } = usePermissions()
  const { members } = useMembers()
  const { calendars } = useVisibleCalendars()
  const { projects: myProjects } = useMyProjects()
  const projects = myProjects ?? []
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  // when editing an occurrence, hold the payload while we ask the scope
  const [pendingScope, setPendingScope] = React.useState<Record<
    string,
    unknown
  > | null>(null)

  const writableCalendars = calendars.filter(
    (c) =>
      !c.calendar.archived &&
      (isManager || c.calendar.writeScope === "everyone")
  )

  // Reset the draft each time the editor opens (render-phase state adjustment —
  // the sanctioned "reset state when a prop changes" pattern, not an effect).
  const openKey = open
    ? `${item?.id ?? "new"}:${JSON.stringify(seed ?? {})}`
    : null
  const [seededKey, setSeededKey] = React.useState<string | null>(null)
  if (openKey !== seededKey) {
    setSeededKey(openKey)
    if (openKey) {
      setDraft(
        item
          ? draftFromItem(item)
          : draftFromSeed(seed ?? {}, writableCalendars[0]?.calendar.id ?? "")
      )
    }
  }

  if (!draft) return null

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d))

  function toggleAssignee(uid: string) {
    setDraft((d) => {
      if (!d) return d
      const next = d.assigneeIds.includes(uid)
        ? d.assigneeIds.filter((x) => x !== uid)
        : [...d.assigneeIds, uid]
      return {
        ...d,
        assigneeIds: next,
        primaryAssigneeId: resolvePrimaryAssignee(next, d.primaryAssigneeId),
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !user) return
    if (!draft.calendarId) {
      toast.error("Chọn lịch con")
      return
    }
    const startMs = draft.allDay
      ? vnDateInputToMs(draft.start)
      : vnDateTimeInputToMs(draft.start)
    const endMsInclusive = draft.allDay
      ? vnDateInputToMs(draft.end)
      : vnDateTimeInputToMs(draft.end)
    // all-day end is exclusive → +1 day
    const endMs = draft.allDay ? endMsInclusive + 24 * 60 * 60 * 1000 : endMsInclusive

    if (draft.allDay ? endMsInclusive < startMs : endMs <= startMs) {
      toast.error(
        draft.allDay
          ? "Ngày kết thúc không được trước ngày bắt đầu"
          : "Giờ kết thúc phải sau giờ bắt đầu"
      )
      return
    }

    const payload = {
      calendarId: draft.calendarId,
      type: draft.type,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      location: draft.location.trim() || null,
      allDay: draft.allDay,
      startAt: new Date(startMs).toISOString(),
      endAt: new Date(endMs).toISOString(),
      assigneeIds: draft.assigneeIds,
      primaryAssigneeId: draft.primaryAssigneeId,
      linkedProjectId: draft.linkedProjectId,
      reminders: draft.reminders,
      recurrence: item?.occurrence ? undefined : draft.recurrence,
    }

    // task 8.4 — editing one occurrence asks the scope first
    if (item?.occurrence) {
      setPendingScope(payload)
      return
    }

    await submit(payload)
  }

  async function submit(
    payload: Record<string, unknown>,
    scope?: { scope: RecurrenceEditScope; occurrenceKey: string }
  ) {
    setSubmitting(true)
    try {
      const targetId = scope
        ? item!.occurrence!.masterId
        : (item?.id ?? "")
      const { id } =
        item || scope
          ? await updateCalendarItem(targetId, { ...payload, ...scope })
          : await createCalendarItem(payload as never)
      toast.success(item ? "Đã lưu" : "Đã tạo mục")
      setPendingScope(null)
      onOpenChange(false)
      onSaved?.(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setSubmitting(false)
    }
  }

  const title = item
    ? `Sửa: ${calendarItemDisplayTitle(item.title)}`
    : "Mục lịch mới"

  const body = (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 overflow-y-auto">
      <FieldGroup>
        <Field>
          <FieldLabel>Loại</FieldLabel>
          <Select
            value={draft.type}
            onValueChange={(v) => v && set("type", v as CalendarItemType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALENDAR_ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {CALENDAR_ITEM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="item-title">Tiêu đề</FieldLabel>
          <Input
            id="item-title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="(Không có tiêu đề)"
            autoFocus
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={draft.allDay}
            onCheckedChange={(c) => {
              const allDay = c === true
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      allDay,
                      start: allDay
                        ? d.start.slice(0, 10)
                        : `${d.start.slice(0, 10)}T09:00`,
                      end: allDay
                        ? d.end.slice(0, 10)
                        : `${d.end.slice(0, 10)}T10:00`,
                    }
                  : d
              )
            }}
          />
          Cả ngày
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Field>
            <FieldLabel htmlFor="item-start">Bắt đầu</FieldLabel>
            <Input
              id="item-start"
              type={draft.allDay ? "date" : "datetime-local"}
              value={draft.start}
              onChange={(e) => set("start", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="item-end">Kết thúc</FieldLabel>
            <Input
              id="item-end"
              type={draft.allDay ? "date" : "datetime-local"}
              value={draft.end}
              onChange={(e) => set("end", e.target.value)}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel>Lịch con</FieldLabel>
          <Select
            value={draft.calendarId}
            onValueChange={(v) => v && set("calendarId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn lịch" />
            </SelectTrigger>
            <SelectContent>
              {writableCalendars.map((c) => (
                <SelectItem key={c.calendar.id} value={c.calendar.id}>
                  {c.calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Người đảm nhận</FieldLabel>
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded border p-2">
            {members.map((m) => (
              <label key={m.uid} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.assigneeIds.includes(m.uid)}
                  onCheckedChange={() => toggleAssignee(m.uid)}
                />
                <span className="flex-1">{m.displayName}</span>
                {draft.assigneeIds.includes(m.uid) && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground"
                    onClick={() => set("primaryAssigneeId", m.uid)}
                  >
                    {draft.primaryAssigneeId === m.uid
                      ? "● chính"
                      : "đặt chính"}
                  </button>
                )}
              </label>
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="item-location">Địa điểm</FieldLabel>
          <Input
            id="item-location"
            value={draft.location}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="item-desc">Mô tả</FieldLabel>
          <Textarea
            id="item-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel>Liên kết Dự án</FieldLabel>
          <Select
            value={draft.linkedProjectId ?? NONE}
            onValueChange={(v) =>
              set("linkedProjectId", !v || v === NONE ? null : v)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Không liên kết</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Nhắc nhở</FieldLabel>
          <RemindersField
            value={draft.reminders}
            onChange={(next) => set("reminders", next)}
          />
        </Field>

        {!item?.occurrence && (
          <Field>
            <FieldLabel>Lặp lại</FieldLabel>
            <RecurrenceEditor
              value={draft.recurrence}
              startDayKey={
                draft.start.slice(0, 10) || vnDateKey(Date.now())
              }
              startMs={
                draft.allDay
                  ? vnDateInputToMs(draft.start)
                  : vnDateTimeInputToMs(draft.start)
              }
              onChange={(rule) => set("recurrence", rule)}
            />
          </Field>
        )}
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Huỷ
        </Button>
        <Button type="submit" disabled={submitting}>
          {item ? "Lưu" : "Tạo"}
        </Button>
      </div>
    </form>
  )

  const scopeDialog = item?.occurrence ? (
    <RecurrenceScopeDialog
      open={pendingScope !== null}
      action="edit"
      onCancel={() => setPendingScope(null)}
      onPick={(scope) =>
        submit(pendingScope!, {
          scope,
          occurrenceKey: item.occurrence!.occurrenceKey,
        })
      }
    />
  ) : null

  if (isMobile) {
    return (
      <>
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="max-h-[90vh] p-4">
            <SheetHeader className="p-0">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            {body}
          </SheetContent>
        </Sheet>
        {scopeDialog}
      </>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
      {scopeDialog}
    </>
  )
}
