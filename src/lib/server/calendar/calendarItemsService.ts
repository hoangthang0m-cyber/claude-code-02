import type { Firestore } from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  calendarItemCreateSchema,
  calendarItemUpdateSchema,
  isValidItemRange,
  recurrenceScopeSchema,
  type Reminder,
} from "@/lib/domain/calendar"
import type { AuthedUser } from "@/lib/server/auth"
import { assertCalendarAcceptsItems } from "@/lib/server/calendar/calendarsRepo"
import {
  createCalendarItem,
  duplicateCalendarItem,
  restoreCalendarItem,
  softDeleteCalendarItem,
  updateCalendarItem,
  type CalendarItemWriteInput,
} from "@/lib/server/calendar/calendarItemsRepo"
import { assertCanEditItem } from "@/lib/server/calendar/itemPermissions"
import {
  deleteSeries,
  editSeries,
  type OccurrencePatch,
} from "@/lib/server/calendar/recurrenceOps"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// Orchestrates a calendarItems mutation: auth-matrix check → calendar
// acceptability (archived / managerOnly) → range validation → the repo write.
// The route handlers stay thin. Hooks for group 9 (assignee notifications) and
// group 10 (dueReminders recompute) attach here later.

type Actor = Pick<AuthedUser, "uid" | "system_role">

async function calendarDefaultReminders(
  db: Firestore,
  calendarId: string
): Promise<Reminder[]> {
  const snap = await db
    .collection(CALENDAR_COLLECTIONS.calendars)
    .doc(calendarId)
    .get()
  const r = snap.data()?.defaultReminders
  return Array.isArray(r) ? (r as Reminder[]) : []
}

function assertRange(startMs: number, endMs: number, allDay: boolean): void {
  if (!isValidItemRange(startMs, endMs, allDay)) {
    throw new HttpError(
      400,
      allDay
        ? "Ngày kết thúc không được trước ngày bắt đầu"
        : "Giờ kết thúc phải sau giờ bắt đầu"
    )
  }
}

// Mục B `item-assignees` — Scenario "Chọn người ngoài danh bạ": a "người đảm
// nhận" must be a member of the directory. The picker only offers active members
// (no free-text entry), and the server re-checks so a crafted request cannot
// slip a stranger in. Only the *newly added* ids are validated, so editing an
// older item whose assignee has since left the team still saves; a departed
// member's doc keeps `active: false` rather than being deleted.
async function assertAssigneesInDirectory(
  db: Firestore,
  candidateIds: string[]
): Promise<void> {
  const ids = [...new Set(candidateIds)]
  if (ids.length === 0) return
  const snaps = await db.getAll(
    ...ids.map((uid) => db.collection(CALENDAR_COLLECTIONS.members).doc(uid))
  )
  if (snaps.some((s) => !s.exists)) {
    throw new HttpError(
      400,
      "Người đảm nhận phải là thành viên trong danh bạ đội"
    )
  }
}

// task 5.2 — create from the full form or the quick-create popover.
export async function createItem(
  db: Firestore,
  actor: Actor,
  body: unknown
): Promise<{ id: string }> {
  const input = parseOrThrow(calendarItemCreateSchema, body)

  await assertCalendarAcceptsItems(db, input.calendarId, actor)
  await assertAssigneesInDirectory(db, input.assigneeIds)

  const startMs = Date.parse(input.startAt)
  const endMs = Date.parse(input.endAt)
  assertRange(startMs, endMs, input.allDay)

  const reminders =
    input.reminders ?? (await calendarDefaultReminders(db, input.calendarId))

  const write: CalendarItemWriteInput = {
    calendarId: input.calendarId,
    type: input.type,
    title: input.title,
    description: input.description,
    location: input.location,
    allDay: input.allDay,
    startAtMs: startMs,
    endAtMs: endMs,
    colorOverride: input.colorOverride,
    assigneeIds: input.assigneeIds,
    primaryAssigneeId: input.primaryAssigneeId,
    linkedProjectId: input.linkedProjectId,
    linkedContentItemId: input.linkedContentItemId,
    reminders,
    recurrence: input.recurrence,
    recurrenceId: null,
  }

  const result = await createCalendarItem(db, write, actor.uid)
  // group 9: notify new assignees (except self). group 10: queue dueReminders.
  return result
}

// task 5.2 — field-by-field edit (also the drag move/resize path in group 7).
export async function updateItem(
  db: Firestore,
  actor: Actor,
  itemId: string,
  body: unknown
): Promise<{ id: string }> {
  // recurring-series edit (Mục D task 8.4) — the body carries a scope
  const b = (body ?? {}) as Record<string, unknown>
  if (b.scope) {
    const { scope, occurrenceKey, overwriteExceptions } = parseOrThrow(
      recurrenceScopeSchema,
      body
    )
    const patch = parseOrThrow(calendarItemUpdateSchema, body)
    if (patch.assigneeIds) {
      await assertAssigneesInDirectory(db, patch.assigneeIds)
    }
    return editSeries(
      db,
      actor,
      itemId,
      occurrenceKey,
      scope,
      toOccurrencePatch(patch),
      overwriteExceptions
    )
  }

  const patch = parseOrThrow(calendarItemUpdateSchema, body)
  const current = await assertCanEditItem(db, itemId, actor)

  if (patch.assigneeIds) {
    const currentAssignees = Array.isArray(current.assigneeIds)
      ? (current.assigneeIds as string[])
      : []
    const added = patch.assigneeIds.filter((id) => !currentAssignees.includes(id))
    await assertAssigneesInDirectory(db, added)
  }

  // can't edit an item while its calendar is archived / not writable
  await assertCalendarAcceptsItems(db, String(current.calendarId), actor)
  // moving it into another calendar → that one must accept it too
  if (patch.calendarId && patch.calendarId !== current.calendarId) {
    await assertCalendarAcceptsItems(db, patch.calendarId, actor)
  }

  const curStart = (current.startAt as { toMillis: () => number }).toMillis()
  const curEnd = (current.endAt as { toMillis: () => number }).toMillis()
  const startMs = patch.startAt ? Date.parse(patch.startAt) : curStart
  const endMs = patch.endAt ? Date.parse(patch.endAt) : curEnd
  const allDay = patch.allDay ?? Boolean(current.allDay)
  assertRange(startMs, endMs, allDay)

  await updateCalendarItem(
    db,
    itemId,
    {
      calendarId: patch.calendarId,
      type: patch.type,
      title: patch.title,
      description: patch.description,
      location: patch.location,
      allDay: patch.allDay,
      startAtMs: patch.startAt ? startMs : undefined,
      endAtMs: patch.endAt ? endMs : undefined,
      colorOverride: patch.colorOverride,
      assigneeIds: patch.assigneeIds,
      primaryAssigneeId: patch.primaryAssigneeId,
      linkedProjectId: patch.linkedProjectId,
      linkedContentItemId: patch.linkedContentItemId,
      reminders: patch.reminders,
      recurrence: patch.recurrence,
    },
    actor.uid
  )
  return { id: itemId }
}

// task 5.1 — "Xoá" in the detail popover. Soft delete for Undo (group 7); a
// Nhân sự may only soft-delete their own / assigned items (assertCanEditItem).
// A body with a `scope` deletes an occurrence of a recurring series (task 8.5).
export async function deleteItem(
  db: Firestore,
  actor: Actor,
  itemId: string,
  body?: unknown
): Promise<{ id: string }> {
  const b = (body ?? {}) as Record<string, unknown>
  if (b.scope) {
    const { scope, occurrenceKey } = parseOrThrow(recurrenceScopeSchema, body)
    return deleteSeries(db, actor, itemId, occurrenceKey, scope)
  }
  await assertCanEditItem(db, itemId, actor)
  await softDeleteCalendarItem(db, itemId, actor.uid)
  return { id: itemId }
}

function toOccurrencePatch(
  patch: import("@/lib/domain/calendar").CalendarItemUpdate
): OccurrencePatch {
  return {
    title: patch.title,
    description: patch.description ?? undefined,
    location: patch.location ?? undefined,
    type: patch.type,
    allDay: patch.allDay,
    startAtMs: patch.startAt ? Date.parse(patch.startAt) : undefined,
    endAtMs: patch.endAt ? Date.parse(patch.endAt) : undefined,
    colorOverride: patch.colorOverride ?? undefined,
    assigneeIds: patch.assigneeIds,
    primaryAssigneeId: patch.primaryAssigneeId ?? undefined,
    reminders: patch.reminders,
  }
}

// Undo (group 7).
export async function restoreItem(
  db: Firestore,
  actor: Actor,
  itemId: string
): Promise<{ id: string }> {
  await assertCanEditItem(db, itemId, actor)
  await restoreCalendarItem(db, itemId, actor.uid)
  return { id: itemId }
}

// task 5.1 / Mục B `calendar-item-editing` — "Nhân bản". A new independent item
// in the same calendar (must accept the actor's writes), recurrence stripped.
export async function duplicateItem(
  db: Firestore,
  actor: Actor,
  itemId: string
): Promise<{ id: string }> {
  const snap = await db
    .collection(CALENDAR_COLLECTIONS.calendarItems)
    .doc(itemId)
    .get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  await assertCalendarAcceptsItems(db, String(snap.data()?.calendarId), actor)
  return duplicateCalendarItem(db, itemId, actor.uid)
}
