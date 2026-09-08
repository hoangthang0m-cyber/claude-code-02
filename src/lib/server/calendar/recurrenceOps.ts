import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  occurrenceStartMs,
  openEndedRule,
  setRRuleUntil,
  type RecurrenceEditScope,
} from "@/lib/domain/calendar"
import type { AuthedUser } from "@/lib/server/auth"
import { assertCalendarAcceptsItems } from "@/lib/server/calendar/calendarsRepo"
import { deriveStoredItemFields } from "@/lib/server/calendar/calendarItemsRepo"
import { assertCanEditItem } from "@/lib/server/calendar/itemPermissions"
import { HttpError } from "@/lib/server/http"

// Scope-aware edit / delete of a recurring series (Mục C §4; Mục D tasks
// 8.4 / 8.5 / 8.6). `patch` fields for an occurrence override come in as epoch
// ms for the times and plain values otherwise.

type Actor = Pick<AuthedUser, "uid" | "system_role">

const ITEMS = CALENDAR_COLLECTIONS.calendarItems
const EXC = CALENDAR_COLLECTIONS.exceptions

export interface OccurrencePatch {
  title?: string
  description?: string | null
  location?: string | null
  type?: "goal" | "activity" | "task"
  allDay?: boolean
  startAtMs?: number
  endAtMs?: number
  colorOverride?: string | null
  assigneeIds?: string[]
  primaryAssigneeId?: string | null
  reminders?: { offsetMinutes: number; channel: "inapp" | "push" }[]
}

function overridesFromPatch(patch: OccurrencePatch): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  const copy = [
    "title",
    "description",
    "location",
    "type",
    "allDay",
    "colorOverride",
    "assigneeIds",
    "primaryAssigneeId",
    "reminders",
  ] as const
  for (const k of copy) if (patch[k] !== undefined) o[k] = patch[k]
  if (patch.startAtMs !== undefined) o.startAt = Timestamp.fromMillis(patch.startAtMs)
  if (patch.endAtMs !== undefined) o.endAt = Timestamp.fromMillis(patch.endAtMs)
  return o
}

async function loadMaster(db: Firestore, masterId: string, actor: Actor) {
  const master = await assertCanEditItem(db, masterId, actor)
  if (!master.recurrence) {
    throw new HttpError(400, "Mục này không phải chuỗi lặp")
  }
  await assertCalendarAcceptsItems(db, String(master.calendarId), actor)
  return master
}

// task 8.4 — edit.
export async function editSeries(
  db: Firestore,
  actor: Actor,
  masterId: string,
  occurrenceKey: string,
  scope: RecurrenceEditScope,
  patch: OccurrencePatch,
  overwriteExceptions = false
): Promise<{ id: string }> {
  const master = await loadMaster(db, masterId, actor)
  const masterRef = db.collection(ITEMS).doc(masterId)
  const rule = String(master.recurrence)
  const masterStartMs = (master.startAt as Timestamp).toMillis()

  if (scope === "this") {
    const startMs = occurrenceStartMs(rule, masterStartMs, occurrenceKey)
    await masterRef
      .collection(EXC)
      .doc(occurrenceKey)
      .set(
        {
          originalDateKey: occurrenceKey,
          action: "modified",
          overrides: overridesFromPatch(patch),
          originalStartAt: Timestamp.fromMillis(startMs ?? masterStartMs),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    return { id: masterId }
  }

  if (scope === "all") {
    const repoPatch = {
      title: patch.title,
      description: patch.description,
      location: patch.location,
      type: patch.type,
      allDay: patch.allDay,
      startAtMs: patch.startAtMs,
      endAtMs: patch.endAtMs,
      colorOverride: patch.colorOverride as never,
      assigneeIds: patch.assigneeIds,
      primaryAssigneeId: patch.primaryAssigneeId,
      reminders: patch.reminders,
    }
    // reuse the repo's derive by loading current + merging via a partial write
    const cur = master
    const merged = mergeWrite(cur, repoPatch)
    await masterRef.update({
      ...deriveStoredItemFields(merged),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    })

    if (overwriteExceptions) {
      const exSnap = await masterRef.collection(EXC).get()
      await Promise.all(
        exSnap.docs
          .filter((d) => d.data().action === "modified")
          .map((d) => d.ref.delete())
      )
    }
    return { id: masterId }
  }

  // scope === "thisAndFollowing" — split the series
  await masterRef.update({
    recurrence: setRRuleUntil(rule, occurrenceKey),
    isRecurring: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  })

  const splitStartMs =
    patch.startAtMs ??
    occurrenceStartMs(rule, masterStartMs, occurrenceKey) ??
    masterStartMs
  const duration =
    (master.endAt as Timestamp).toMillis() - masterStartMs
  const newMaster = mergeWrite(master, {
    ...patch,
    startAtMs: splitStartMs,
    endAtMs: patch.endAtMs ?? splitStartMs + duration,
  })
  const newRef = db.collection(ITEMS).doc()
  await newRef.set({
    ...deriveStoredItemFields({ ...newMaster, recurrence: openEndedRule(rule) }),
    recurrenceId: (master.recurrenceId as string | null) ?? masterId,
    createdBy: actor.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
    deletedAt: null,
  })

  // move exceptions on/after the split to the new master
  const exSnap = await masterRef.collection(EXC).get()
  await Promise.all(
    exSnap.docs
      .filter((d) => d.id >= occurrenceKey)
      .map(async (d) => {
        await newRef.collection(EXC).doc(d.id).set(d.data())
        await d.ref.delete()
      })
  )
  return { id: newRef.id }
}

// task 8.5 — delete.
export async function deleteSeries(
  db: Firestore,
  actor: Actor,
  masterId: string,
  occurrenceKey: string,
  scope: RecurrenceEditScope
): Promise<{ id: string }> {
  const master = await loadMaster(db, masterId, actor)
  const masterRef = db.collection(ITEMS).doc(masterId)
  const rule = String(master.recurrence)
  const masterStartMs = (master.startAt as Timestamp).toMillis()

  if (scope === "this") {
    const startMs = occurrenceStartMs(rule, masterStartMs, occurrenceKey)
    await masterRef
      .collection(EXC)
      .doc(occurrenceKey)
      .set({
        originalDateKey: occurrenceKey,
        action: "cancelled",
        overrides: {},
        originalStartAt: Timestamp.fromMillis(startMs ?? masterStartMs),
        updatedAt: FieldValue.serverTimestamp(),
      })
    return { id: masterId }
  }

  // "thisAndFollowing" (or "all" → treat as delete the whole master)
  if (scope === "all" || occurrenceKey <= String(master.startDay)) {
    await masterRef.update({
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    })
    return { id: masterId }
  }

  await masterRef.update({
    recurrence: setRRuleUntil(rule, occurrenceKey),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: actor.uid,
  })
  return { id: masterId }
}

// Merge a repo-shaped patch onto a doc into the full write input the derive
// function needs.
function mergeWrite(
  cur: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  const p = <T,>(key: string, fallback: T): T =>
    patch[key] !== undefined ? (patch[key] as T) : fallback
  return {
    calendarId: cur.calendarId as string,
    type: p("type", cur.type as "goal" | "activity" | "task"),
    title: p("title", (cur.title as string) ?? ""),
    description: p("description", (cur.description as string | null) ?? null),
    location: p("location", (cur.location as string | null) ?? null),
    allDay: p("allDay", Boolean(cur.allDay)),
    startAtMs: p("startAtMs", (cur.startAt as Timestamp).toMillis()),
    endAtMs: p("endAtMs", (cur.endAt as Timestamp).toMillis()),
    colorOverride: p("colorOverride", (cur.colorOverride as never) ?? null),
    assigneeIds: p("assigneeIds", (cur.assigneeIds as string[]) ?? []),
    primaryAssigneeId: p(
      "primaryAssigneeId",
      (cur.primaryAssigneeId as string | null) ?? null
    ),
    linkedProjectId: (cur.linkedProjectId as string | null) ?? null,
    linkedContentItemId: (cur.linkedContentItemId as string | null) ?? null,
    reminders: p("reminders", (cur.reminders as never) ?? []),
    recurrence: (cur.recurrence as string | null) ?? null,
    recurrenceId: (cur.recurrenceId as string | null) ?? null,
  }
}
