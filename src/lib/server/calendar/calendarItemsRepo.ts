import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  DAY_MS,
  computeDayFields,
  resolvePrimaryAssignee,
  vnDateKey,
  vnDayStartMs,
  type CalendarColorKey,
  type CalendarItemType,
  type Reminder,
} from "@/lib/domain/calendar"
import { HttpError } from "@/lib/server/http"

// The single write layer for calendarItems (Mục D task 3.5). Every mutation goes
// through here so the derived fields (`startDay/endDay/spanDays/dayKeys/
// isLongSpan`, `isRecurring`) and `updatedAt`/`updatedBy` are always recomputed
// — the route handlers (group 5) add auth, validation and the `dueReminders`
// recompute on top. Server-side (firebase-admin) because the app routes writes
// through /api/** even though firestore.rules also permits the matrix directly.

const ITEMS = CALENDAR_COLLECTIONS.calendarItems

// The caller-resolved shape a write starts from (times as epoch ms — the route
// converts the ISO body).
export interface CalendarItemWriteInput {
  calendarId: string
  type: CalendarItemType
  title: string
  description: string | null
  location: string | null
  allDay: boolean
  startAtMs: number
  endAtMs: number
  colorOverride: CalendarColorKey | null
  assigneeIds: string[]
  primaryAssigneeId: string | null
  linkedProjectId: string | null
  linkedContentItemId: string | null
  reminders: Reminder[]
  recurrence: string | null
  recurrenceId: string | null
}

// All-day items are stored with midnight-aligned VN instants (Mục C §1:
// "với allDay: 00:00 giờ VN … 00:00 ngày sau ngày kết thúc").
function normalizeInstants(input: CalendarItemWriteInput): {
  startAtMs: number
  endAtMs: number
} {
  if (!input.allDay) return { startAtMs: input.startAtMs, endAtMs: input.endAtMs }
  const startKey = vnDateKey(input.startAtMs)
  const endKey = vnDateKey(Math.max(input.startAtMs, input.endAtMs - 1))
  return {
    startAtMs: vnDayStartMs(startKey),
    endAtMs: vnDayStartMs(endKey) + DAY_MS,
  }
}

// Everything a calendarItems doc stores except id / createdBy / createdAt.
export function deriveStoredItemFields(input: CalendarItemWriteInput) {
  const { startAtMs, endAtMs } = normalizeInstants(input)
  const day = computeDayFields({ startAt: startAtMs, endAt: endAtMs, allDay: input.allDay })

  return {
    calendarId: input.calendarId,
    type: input.type,
    title: input.title.trim(),
    description: input.description,
    location: input.location,
    allDay: input.allDay,
    startAt: Timestamp.fromMillis(startAtMs),
    endAt: Timestamp.fromMillis(endAtMs),
    startDay: day.startDay,
    endDay: day.endDay,
    spanDays: day.spanDays,
    dayKeys: day.dayKeys,
    isLongSpan: day.isLongSpan,
    isRecurring: input.recurrence != null,
    colorOverride: input.colorOverride,
    assigneeIds: input.assigneeIds,
    primaryAssigneeId: resolvePrimaryAssignee(
      input.assigneeIds,
      input.primaryAssigneeId
    ),
    linkedProjectId: input.linkedProjectId,
    linkedContentItemId: input.linkedContentItemId,
    reminders: input.reminders,
    recurrence: input.recurrence,
    recurrenceId: input.recurrenceId,
  }
}

export async function createCalendarItem(
  db: Firestore,
  input: CalendarItemWriteInput,
  actorUid: string
): Promise<{ id: string }> {
  const ref = db.collection(ITEMS).doc()
  const now = FieldValue.serverTimestamp()
  await ref.set({
    ...deriveStoredItemFields(input),
    createdBy: actorUid,
    createdAt: now,
    updatedAt: now,
    updatedBy: actorUid,
    deletedAt: null,
  })
  return { id: ref.id }
}

type MutablePatch = Partial<CalendarItemWriteInput>

// Loads the doc, merges the patch, re-derives every stored field, writes.
export async function updateCalendarItem(
  db: Firestore,
  itemId: string,
  patch: MutablePatch,
  actorUid: string
): Promise<void> {
  const ref = db.collection(ITEMS).doc(itemId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  const cur = snap.data() as Record<string, unknown>

  const pick = <K extends keyof CalendarItemWriteInput>(
    key: K,
    fromDoc: CalendarItemWriteInput[K]
  ): CalendarItemWriteInput[K] =>
    patch[key] !== undefined ? (patch[key] as CalendarItemWriteInput[K]) : fromDoc

  const merged: CalendarItemWriteInput = {
    calendarId: pick("calendarId", cur.calendarId as string),
    type: pick("type", cur.type as CalendarItemType),
    title: pick("title", (cur.title as string) ?? ""),
    description: pick("description", (cur.description as string | null) ?? null),
    location: pick("location", (cur.location as string | null) ?? null),
    allDay: pick("allDay", Boolean(cur.allDay)),
    startAtMs: pick("startAtMs", (cur.startAt as Timestamp).toMillis()),
    endAtMs: pick("endAtMs", (cur.endAt as Timestamp).toMillis()),
    colorOverride: pick(
      "colorOverride",
      (cur.colorOverride as CalendarColorKey | null) ?? null
    ),
    assigneeIds: pick("assigneeIds", (cur.assigneeIds as string[]) ?? []),
    primaryAssigneeId: pick(
      "primaryAssigneeId",
      (cur.primaryAssigneeId as string | null) ?? null
    ),
    linkedProjectId: pick(
      "linkedProjectId",
      (cur.linkedProjectId as string | null) ?? null
    ),
    linkedContentItemId: pick(
      "linkedContentItemId",
      (cur.linkedContentItemId as string | null) ?? null
    ),
    reminders: pick("reminders", (cur.reminders as Reminder[]) ?? []),
    recurrence: pick("recurrence", (cur.recurrence as string | null) ?? null),
    recurrenceId: pick(
      "recurrenceId",
      (cur.recurrenceId as string | null) ?? null
    ),
  }

  await ref.update({
    ...deriveStoredItemFields(merged),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  })
}

// Soft delete for Undo (Mục C §1 — cleaned after 30 days by task 13.1).
export async function softDeleteCalendarItem(
  db: Firestore,
  itemId: string,
  actorUid: string
): Promise<void> {
  const ref = db.collection(ITEMS).doc(itemId)
  if (!(await ref.get()).exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  await ref.update({
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  })
}

export async function restoreCalendarItem(
  db: Firestore,
  itemId: string,
  actorUid: string
): Promise<void> {
  const ref = db.collection(ITEMS).doc(itemId)
  if (!(await ref.get()).exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  await ref.update({
    deletedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actorUid,
  })
}

// Duplicate → a new independent item, copying every field except the recurrence
// rule (Mục B `calendar-item-editing` — "Nhân bản mục").
export async function duplicateCalendarItem(
  db: Firestore,
  itemId: string,
  actorUid: string
): Promise<{ id: string }> {
  const snap = await db.collection(ITEMS).doc(itemId).get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy mục lịch")
  const cur = snap.data() as Record<string, unknown>

  return createCalendarItem(
    db,
    {
      calendarId: cur.calendarId as string,
      type: cur.type as CalendarItemType,
      title: (cur.title as string) ?? "",
      description: (cur.description as string | null) ?? null,
      location: (cur.location as string | null) ?? null,
      allDay: Boolean(cur.allDay),
      startAtMs: (cur.startAt as Timestamp).toMillis(),
      endAtMs: (cur.endAt as Timestamp).toMillis(),
      colorOverride: (cur.colorOverride as CalendarColorKey | null) ?? null,
      assigneeIds: (cur.assigneeIds as string[]) ?? [],
      primaryAssigneeId: (cur.primaryAssigneeId as string | null) ?? null,
      linkedProjectId: (cur.linkedProjectId as string | null) ?? null,
      linkedContentItemId: (cur.linkedContentItemId as string | null) ?? null,
      reminders: (cur.reminders as Reminder[]) ?? [],
      recurrence: null,
      recurrenceId: null,
    },
    actorUid
  )
}
