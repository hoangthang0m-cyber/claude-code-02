"use client"

import * as React from "react"

import {
  RECURRENCE_EDIT_SCOPES,
  RECURRENCE_EDIT_SCOPE_LABELS,
  type RecurrenceEditScope,
} from "@/lib/domain/calendar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// task 7.8 / 8.4 — before editing / dragging / deleting one occurrence of a
// recurring series, ask which occurrences the change applies to. Group 8 wires
// each scope to the right series operation.
export function RecurrenceScopeDialog({
  open,
  action,
  onPick,
  onCancel,
}: {
  open: boolean
  action: "edit" | "delete"
  onPick: (scope: RecurrenceEditScope) => void
  onCancel: () => void
}) {
  const [scope, setScope] = React.useState<RecurrenceEditScope>("this")

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {action === "delete" ? "Xoá mục lặp" : "Sửa mục lặp"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {RECURRENCE_EDIT_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input
                type="radio"
                name="recurrence-scope"
                checked={scope === s}
                onChange={() => setScope(s)}
              />
              {RECURRENCE_EDIT_SCOPE_LABELS[s]}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
          <Button onClick={() => onPick(scope)}>Áp dụng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
