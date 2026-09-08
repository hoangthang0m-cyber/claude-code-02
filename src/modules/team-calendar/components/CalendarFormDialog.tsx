"use client"

import * as React from "react"
import { toast } from "sonner"

import {
  CALENDAR_WRITE_SCOPES,
  DEFAULT_PERSONAL_CALENDAR_COLOR,
  type Calendar,
  type CalendarColorKey,
  type CalendarWriteScope,
  type Reminder,
} from "@/lib/domain/calendar"
import {
  createCalendar,
  updateCalendar,
} from "@/modules/team-calendar/services/calendars.client"
import { CalendarColorSelect } from "@/modules/team-calendar/components/CalendarColorSelect"
import { RemindersField } from "@/modules/team-calendar/components/RemindersField"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea"

const WRITE_SCOPE_LABELS: Record<CalendarWriteScope, string> = {
  everyone: "Mọi người ghi được",
  managerOnly: "Chỉ Trưởng phòng ghi",
}

interface FormState {
  name: string
  color: CalendarColorKey
  description: string
  writeScope: CalendarWriteScope
  defaultReminders: Reminder[]
}

function toState(calendar?: Calendar): FormState {
  return {
    name: calendar?.name ?? "",
    color: calendar?.color ?? DEFAULT_PERSONAL_CALENDAR_COLOR,
    description: calendar?.description ?? "",
    writeScope: calendar?.writeScope ?? "everyone",
    defaultReminders: calendar?.defaultReminders ?? [],
  }
}

// Create / edit a shared sub-calendar (Mục D task 4.3). Only rendered for a
// manager; the server re-checks. Name + colour required.
export function CalendarFormDialog({
  mode,
  calendar,
  trigger,
}: {
  mode: "create" | "edit"
  calendar?: Calendar
  trigger: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<FormState>(toState(calendar))
  const [submitting, setSubmitting] = React.useState(false)

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) setState(toState(calendar))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state.name.trim()) {
      toast.error("Cần nhập tên lịch con")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        name: state.name.trim(),
        color: state.color,
        description: state.description.trim() || null,
        writeScope: state.writeScope,
        defaultReminders: state.defaultReminders,
      }
      if (mode === "create") {
        await createCalendar(payload)
        toast.success("Đã tạo lịch con")
      } else if (calendar) {
        await updateCalendar(calendar.id, payload)
        toast.success("Đã lưu thay đổi")
      }
      setOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Lịch con mới" : "Sửa lịch con"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="calendar-name">Tên *</FieldLabel>
              <Input
                id="calendar-name"
                value={state.name}
                onChange={(e) =>
                  setState((s) => ({ ...s, name: e.target.value }))
                }
                autoFocus
              />
            </Field>

            <Field>
              <FieldLabel>Màu *</FieldLabel>
              <CalendarColorSelect
                value={state.color}
                onChange={(c) =>
                  setState((s) => ({
                    ...s,
                    color: c ?? DEFAULT_PERSONAL_CALENDAR_COLOR,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="calendar-desc">Mô tả</FieldLabel>
              <Textarea
                id="calendar-desc"
                rows={2}
                value={state.description}
                onChange={(e) =>
                  setState((s) => ({ ...s, description: e.target.value }))
                }
              />
            </Field>

            <Field>
              <FieldLabel>Quyền ghi</FieldLabel>
              <Select
                value={state.writeScope}
                onValueChange={(v) =>
                  v &&
                  setState((s) => ({
                    ...s,
                    writeScope: v as CalendarWriteScope,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALENDAR_WRITE_SCOPES.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {WRITE_SCOPE_LABELS[scope]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>Mốc nhắc mặc định</FieldLabel>
              <RemindersField
                value={state.defaultReminders}
                onChange={(next) =>
                  setState((s) => ({ ...s, defaultReminders: next }))
                }
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Huỷ
                </Button>
              }
            />
            <Button type="submit" disabled={submitting}>
              {mode === "create" ? "Tạo" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
