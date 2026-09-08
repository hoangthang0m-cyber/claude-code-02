import {
  FieldValue,
  type Firestore,
  type WriteBatch,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore"

import {
  CALENDAR_COLLECTIONS,
  type CalendarCreate,
  type CalendarDeleteMode,
  type CalendarUpdate,
} from "@/lib/domain/calendar"
import type { AuthedUser } from "@/lib/server/auth"
import { HttpError } from "@/lib/server/http"

// Write layer for sub-calendars (Mục D group 4). Manager-only (checked in the
// route handlers via requireSystemManager); the client only reads. Personal
// calendars are owned by the members sync (task 2.4) — this module only ever
// creates `kind: "shared"`.

const CALENDARS = CALENDAR_COLLECTIONS.calendars
const ITEMS = CALENDAR_COLLECTIONS.calendarItems

export async function createCalendar(
  db: Firestore,
  input: CalendarCreate
): Promise<{ id: string }> {
  const ref = db.collection(CALENDARS).doc()
  const now = FieldValue.serverTimestamp()
  await ref.set({
    name: input.name.trim(),
    color: input.color,
    description: input.description?.trim() || null,
    kind: "shared",
    ownerUid: null,
    writeScope: input.writeScope ?? "everyone",
    defaultReminders: input.defaultReminders ?? [],
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  return { id: ref.id }
}

// task 4.3 (fields) + task 4.5 (`archived`).
export async function updateCalendar(
  db: Firestore,
  calendarId: string,
  patch: CalendarUpdate
): Promise<void> {
  const ref = db.collection(CALENDARS).doc(calendarId)
  if (!(await ref.get()).exists) {
    throw new HttpError(404, "Không tìm thấy lịch con")
  }

  const data: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (patch.name !== undefined) data.name = patch.name.trim()
  if (patch.color !== undefined) data.color = patch.color
  if (patch.description !== undefined) {
    data.description = patch.description?.trim() || null
  }
  if (patch.writeScope !== undefined) data.writeScope = patch.writeScope
  if (patch.defaultReminders !== undefined) {
    data.defaultReminders = patch.defaultReminders
  }
  if (patch.archived !== undefined) data.archived = patch.archived

  if (Object.keys(data).length === 1) {
    throw new HttpError(400, "Không có trường nào để cập nhật")
  }
  await ref.update(data)
}

// task 4.4 — delete a sub-calendar that may still hold items. "reassign" moves
// every item to `targetCalendarId`; "deleteItems" hard-deletes them. The UI owns
// the confirmation step.
export async function deleteCalendar(
  db: Firestore,
  calendarId: string,
  mode: CalendarDeleteMode,
  targetCalendarId: string | null
): Promise<{ mode: CalendarDeleteMode; affectedItems: number }> {
  const ref = db.collection(CALENDARS).doc(calendarId)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy lịch con")

  if (snap.data()?.kind === "personal") {
    throw new HttpError(400, "Không xoá được lịch cá nhân")
  }

  const items = await db
    .collection(ITEMS)
    .where("calendarId", "==", calendarId)
    .get()

  if (mode === "reassign") {
    if (!targetCalendarId) {
      throw new HttpError(400, "Thiếu lịch đích để chuyển mục")
    }
    if (targetCalendarId === calendarId) {
      throw new HttpError(400, "Lịch đích trùng lịch đang xoá")
    }
    if (!(await db.collection(CALENDARS).doc(targetCalendarId).get()).exists) {
      throw new HttpError(404, "Lịch đích không tồn tại")
    }
    await commitInChunks(db, items.docs, (batch, d) =>
      batch.update(d.ref, {
        calendarId: targetCalendarId,
        updatedAt: FieldValue.serverTimestamp(),
      })
    )
  } else {
    await commitInChunks(db, items.docs, (batch, d) => batch.delete(d.ref))
  }

  await ref.delete()
  return { mode, affectedItems: items.size }
}

async function commitInChunks(
  db: Firestore,
  docs: QueryDocumentSnapshot[],
  apply: (batch: WriteBatch, doc: QueryDocumentSnapshot) => void
): Promise<void> {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch()
    for (const doc of docs.slice(i, i + 400)) apply(batch, doc)
    await batch.commit()
  }
}

// Guard used by the calendarItems routes (group 5) before a create / edit:
// an archived calendar is read-only for everyone (task 4.5), and a
// `managerOnly` calendar rejects staff writes (Mục B `calendar-access-control`).
export async function assertCalendarAcceptsItems(
  db: Firestore,
  calendarId: string,
  actor: Pick<AuthedUser, "system_role">
): Promise<void> {
  const snap = await db.collection(CALENDARS).doc(calendarId).get()
  if (!snap.exists) throw new HttpError(404, "Lịch con không tồn tại")
  const cal = snap.data() as { archived?: boolean; writeScope?: string }
  if (cal.archived === true) {
    throw new HttpError(409, "Lịch con đã lưu trữ — chỉ đọc")
  }
  if (cal.writeScope === "managerOnly" && actor.system_role !== "manager") {
    throw new HttpError(
      403,
      'Lịch "chỉ Trưởng phòng ghi" — bạn không thể tạo/sửa mục ở đây'
    )
  }
}
