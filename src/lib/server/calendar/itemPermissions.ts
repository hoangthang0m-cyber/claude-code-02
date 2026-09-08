import type { Firestore } from "firebase-admin/firestore"

import { CALENDAR_COLLECTIONS, canEditCalendarItem } from "@/lib/domain/calendar"
import type { AuthedUser } from "@/lib/server/auth"
import { HttpError } from "@/lib/server/http"

// Server-side of the calendarItems edit matrix. The pure predicate
// (`canEditCalendarItem`) lives in the domain so the client can reuse it;
// firestore.rules encodes the same matrix independently.

export type CalendarActor = Pick<AuthedUser, "uid" | "system_role">

// Loads the item, 404s if missing, 403s if the actor can't edit it. Returns the
// raw doc data (plus id) for the caller.
export async function assertCanEditItem(
  db: Firestore,
  itemId: string,
  actor: CalendarActor
): Promise<Record<string, unknown> & { id: string }> {
  const snap = await db
    .collection(CALENDAR_COLLECTIONS.calendarItems)
    .doc(itemId)
    .get()
  if (!snap.exists) throw new HttpError(404, "Không tìm thấy mục lịch")

  const data = snap.data() as Record<string, unknown>
  const allowed = canEditCalendarItem(
    {
      createdBy: String(data.createdBy ?? ""),
      assigneeIds: Array.isArray(data.assigneeIds)
        ? (data.assigneeIds as string[])
        : [],
    },
    { uid: actor.uid, role: actor.system_role }
  )
  if (!allowed) {
    throw new HttpError(403, "Bạn không có quyền sửa mục này")
  }
  return { id: snap.id, ...data }
}
