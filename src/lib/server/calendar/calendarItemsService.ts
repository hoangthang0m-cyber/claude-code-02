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
import { requireCalendarMember } from "@/lib/server/calendar/access"
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
import { notifyAssigneeChange } from "@/lib/server/calendar/calendarNotifications"
import {
  cancelItemReminders,
  recomputeItemReminders,
} from "@/lib/server/calendar/calendarReminders"
import {
  deleteSeries,
  editSeries,
  type OccurrencePatch,
} from "@/lib/server/calendar/recurrenceOps"
import { HttpError } from "@/lib/server/http"
import { parseOrThrow } from "@/lib/server/validate"

// Orchestrates a calendarItems mutation: auth-matrix check → calendar
// acceptability (archived / managerOnly) → range validation → the repo write →
// the side effects (assignee notifications, group 9 / `dueReminders` recompute,
// group 10). The route handlers stay thin.

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

  await requireCalendarMember(db, actor.uid)
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

  await notifyAssigneeChange(db, {
    itemId: result.id,
    itemTitle: input.title,
    itemStartAtMs: startMs,
    before: [],
    after: input.assigneeIds,
    actorUid: actor.uid,
  })
  await recomputeItemReminders(db, result.id)

  return result
}

// task 5.2 — field-by-field edit (also the drag move/resize path in group 7).
export async function updateItem(
  db: Firestore,
  actor: Actor,
  itemId: string,
  body: unknown
): Promise<{ id: string }> {
  await requireCalendarMember(db, actor.uid)
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
    const seriesResult = await editSeries(
      db,
      actor,
      itemId,
      occurrenceKey,
      scope,
      toOccurrencePatch(patch),
      overwriteExceptions
    )
    // rebuild the series' pending reminders on the next expand pass (task 10.4);
    // clearing now stops rows with a stale time / recipient set from firing.
    await cancelItemReminders(db, itemId)
    return seriesResult
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

  if (patch.assigneeIds) {
    await notifyAssigneeChange(db, {
      itemId,
      itemTitle: patch.title ?? String(current.title ?? ""),
      itemStartAtMs: startMs,
      before: Array.isArray(current.assigneeIds)
        ? (current.assigneeIds as string[])
        : [],
      after: patch.assigneeIds,
      actorUid: actor.uid,
    })
  }
  // reminders follow the item's time / assignees / reminder list (task 10.3);
  // for a now-recurring item this just clears the single-occurrence rows and the
  // 15-min expand job (task 10.4) takes over.
  await recomputeItemReminders(db, itemId)

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
  await requireCalendarMember(db, actor.uid)
  const b = (body ?? {}) as Record<string, unknown>
  if (b.scope) {
    const { scope, occurrenceKey } = parseOrThrow(recurrenceScopeSchema, body)
    const res = await deleteSeries(db, actor, itemId, occurrenceKey, scope)
    await cancelItemReminders(db, itemId)
    return res
  }
  await assertCanEditItem(db, itemId, actor)
  await softDeleteCalendarItem(db, itemId, actor.uid)
  // a soft-deleted item must not fire reminders (task 10.3 / Mục C §5)
  await cancelItemReminders(db, itemId)
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
  await requireCalendarMember(db, actor.uid)
  await assertCanEditItem(db, itemId, actor)
  await restoreCalendarItem(db, itemId, actor.uid)
  // a restored item queues its still-future reminders again (task 10.3)
  await recomputeItemReminders(db, itemId)
  return { id: itemId }
}

// task 5.1 / Mục B `calendar-item-editing` — "Nhân bản". A new independent item
// in the same calendar (must accept the actor's writes), recurrence stripped.
export async function duplicateItem(
  db: Firestore,
  actor: Actor,
  itemId: string
): Promise<{ id: string }> {
  await requireCalendarMember(db, actor.uid)
  const snap = await db
    .collection(CALENDAR_COLLECTIONS.calendarItems)
    .doc(itemId)
    .get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  const src = snap.data()!
  await assertCalendarAcceptsItems(db, String(src.calendarId), actor)
  const copy = await duplicateCalendarItem(db, itemId, actor.uid)

  await notifyAssigneeChange(db, {
    itemId: copy.id,
    itemTitle: String(src.title ?? ""),
    itemStartAtMs: (src.startAt as { toMillis: () => number }).toMillis(),
    before: [],
    after: Array.isArray(src.assigneeIds) ? (src.assigneeIds as string[]) : [],
    actorUid: actor.uid,
  })
  await recomputeItemReminders(db, copy.id)

  return copy
}
