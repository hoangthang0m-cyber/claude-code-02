import type { Firestore } from "firebase-admin/firestore"

import { CALENDAR_COLLECTIONS, type MemberRole } from "@/lib/domain/calendar"
import { HttpError } from "@/lib/server/http"

// Mục B `calendar-access-control` — "Tài khoản không thuộc phòng marketing → từ
// chối truy cập lịch" + "Ràng buộc quyền ở tầng dữ liệu". `firestore.rules`
// enforces this for direct client reads/writes, but the app writes through
// firebase-admin (which bypasses rules), so every calendar mutation route must
// re-check membership here. Role is read from `members/{uid}.role` (task 11.3),
// the mirror the calendar owns — not the caller's global `users` doc.
export async function requireCalendarMember(
  db: Firestore,
  uid: string
): Promise<MemberRole> {
  const snap = await db
    .collection(CALENDAR_COLLECTIONS.members)
    .doc(uid)
    .get()
  if (!snap.exists || snap.data()?.active !== true) {
    throw new HttpError(403, "Bạn không thuộc danh bạ đội marketing")
  }
  return (snap.data()?.role as MemberRole) === "manager" ? "manager" : "staff"
}

// Same, plus the manager gate (task 11.4 / "Quản lý danh sách lịch con giới hạn
// cho Trưởng phòng").
export async function requireCalendarManager(
  db: Firestore,
  uid: string,
  message = "Chỉ Trưởng phòng được thực hiện thao tác này"
): Promise<void> {
  if ((await requireCalendarMember(db, uid)) !== "manager") {
    throw new HttpError(403, message)
  }
}
